import {
  SocketEvent,
  type CallAcceptAck,
  type CallActionPayload,
  type CallEndedEvent,
  type CallInviteEvent,
  type CallParticipantChangedEvent,
  type CallStartAck,
  type CallStartPayload,
  type CallStatus,
} from '@messenger/shared';
import type { Socket } from 'socket.io';

import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import * as callService from '../services/call.js';
import { messageInclude, toMessageDto } from '../services/message.js';
import { emitToChatExcept, getIo } from './index.js';

const MISSED_TIMEOUT_MS = 45_000;
const missedTimers = new Map<string, NodeJS.Timeout>();

function toAckError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  throw error;
}

function clearMissedTimer(callId: string): void {
  const timer = missedTimers.get(callId);
  if (!timer) return;
  clearTimeout(timer);
  missedTimers.delete(callId);
}

function scheduleMissedTimeout(callId: string, initiatorId: string): void {
  clearMissedTimer(callId);
  const timer = setTimeout(() => {
    missedTimers.delete(callId);
    handleMissedTimeout(callId, initiatorId).catch((error: unknown) => {
      logger.error({ err: error, callId }, 'Не удалось обработать пропущенный звонок');
    });
  }, MISSED_TIMEOUT_MS);
  missedTimers.set(callId, timer);
}

async function handleMissedTimeout(callId: string, initiatorId: string): Promise<void> {
  const call = await callService.getCall(callId);
  if (call.status !== 'RINGING') return;
  await finishCall(callId, initiatorId, 'MISSED');
}

async function finishCall(callId: string, userId: string, status: CallStatus): Promise<void> {
  clearMissedTimer(callId);
  const call = await callService.endCall({ callId, userId, status });

  const io = getIo();
  io?.to(call.chatId).emit(SocketEvent.CallEnded, { call } satisfies CallEndedEvent);

  const message = await prisma.message.findUnique({
    where: { clientId: `call:${call.id}` },
    include: messageInclude,
  });
  if (message) io?.to(call.chatId).emit(SocketEvent.MessageNew, toMessageDto(message));
}

export function registerCallHandlers(socket: Socket, userId: string): void {
  socket.on(SocketEvent.CallStart, (payload: CallStartPayload, ack?: (result: CallStartAck) => void) => {
    callService
      .startCall({ chatId: payload.chatId, userId, kind: payload.kind })
      .then((access) => {
        ack?.({ ok: true, access });
        emitToChatExcept(payload.chatId, userId, SocketEvent.CallInvite, { call: access.call } satisfies CallInviteEvent);
        scheduleMissedTimeout(access.call.id, userId);
      })
      .catch((error: unknown) => {
        ack?.({ ok: false, error: toAckError(error) });
      });
  });

  socket.on(SocketEvent.CallAccept, (payload: CallActionPayload, ack?: (result: CallAcceptAck) => void) => {
    clearMissedTimer(payload.callId);
    callService
      .joinCall({ callId: payload.callId, userId })
      .then((access) => {
        ack?.({ ok: true, access });
        const io = getIo();
        io?.to(access.call.chatId).emit(SocketEvent.CallParticipantChanged, {
          call: access.call,
        } satisfies CallParticipantChangedEvent);
      })
      .catch((error: unknown) => {
        ack?.({ ok: false, error: toAckError(error) });
      });
  });

  socket.on(SocketEvent.CallDecline, (payload: CallActionPayload) => {
    finishCall(payload.callId, userId, 'DECLINED').catch((error: unknown) => {
      logger.error({ err: error, userId }, 'Ошибка обработки call:decline');
    });
  });

  socket.on(SocketEvent.CallLeave, (payload: CallActionPayload) => {
    handleLeave(payload.callId, userId).catch((error: unknown) => {
      logger.error({ err: error, userId }, 'Ошибка обработки call:leave');
    });
  });

  socket.on('disconnect', () => {
    handleDisconnect(userId).catch((error: unknown) => {
      logger.error({ err: error, userId }, 'Не удалось обработать разрыв сокета для звонков');
    });
  });
}

async function handleLeave(callId: string, userId: string): Promise<void> {
  const call = await callService.leaveCall({ callId, userId });
  const activeParticipants = call.participants.filter((participant) => participant.leftAt === null);

  if (activeParticipants.length >= 2) {
    getIo()?.to(call.chatId).emit(SocketEvent.CallParticipantChanged, { call } satisfies CallParticipantChangedEvent);
    return;
  }

  await finishCall(callId, userId, 'ENDED');
}

async function handleDisconnect(userId: string): Promise<void> {
  const liveCalls = await callService.getLiveCallsForParticipant(userId);

  for (const call of liveCalls) {
    const activeParticipants = call.participants.filter((participant) => participant.leftAt === null);
    const isLastActiveParticipant = activeParticipants.length === 1 && activeParticipants[0]?.user.id === userId;
    if (isLastActiveParticipant) await finishCall(call.id, userId, 'ENDED');
  }
}
