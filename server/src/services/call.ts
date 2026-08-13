import type { CallAccessDto, CallDto, CallKind, CallParticipantDto, CallStatus } from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';
import { AccessToken } from 'livekit-server-sdk';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { assertMember, toMemberSummary } from './chat.js';
import { messageInclude } from './message.js';
import * as pushService from './push.js';
import type { Call, CallParticipant, User } from '../generated/prisma/client.js';

const TOKEN_TTL = '6h';
const ACTIVE_STATUSES: CallStatus[] = ['RINGING', 'ACTIVE'];

const callWithRelations = {
  initiator: true,
  participants: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
} as const;

type CallWithRelations = Call & {
  initiator: User | null;
  participants: (CallParticipant & { user: User })[];
};

function toParticipantDto(participant: CallParticipant & { user: User }): CallParticipantDto {
  return {
    user: toMemberSummary(participant.user),
    joinedAt: participant.joinedAt?.toISOString() ?? null,
    leftAt: participant.leftAt?.toISOString() ?? null,
  };
}

function toCallDto(call: CallWithRelations): CallDto {
  return {
    id: call.id,
    chatId: call.chatId,
    initiator: call.initiator ? toMemberSummary(call.initiator) : null,
    kind: call.kind,
    status: call.status,
    startedAt: call.startedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    participants: call.participants.map(toParticipantDto),
  };
}

async function issueAccessToken(callId: string, userId: string): Promise<string> {
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    ttl: TOKEN_TTL,
  });
  token.addGrant({
    room: `call:${callId}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  return await token.toJwt();
}

async function getCallOrThrow(callId: string): Promise<CallWithRelations> {
  const call = await prisma.call.findUnique({ where: { id: callId }, include: callWithRelations });
  if (!call) throw notFound(ErrorCode.CALL_NOT_FOUND, 'Звонок не найден');
  return call;
}

export async function startCall(input: { chatId: string; userId: string; kind: CallKind }): Promise<CallAccessDto> {
  await assertMember(input.chatId, input.userId);

  const existing = await prisma.call.findFirst({
    where: { chatId: input.chatId, status: { in: ACTIVE_STATUSES } },
    include: callWithRelations,
  });

  const call =
    existing ??
    (await prisma.call.create({
      data: {
        chatId: input.chatId,
        initiatorId: input.userId,
        kind: input.kind,
        status: 'RINGING',
        participants: { create: { userId: input.userId, joinedAt: new Date() } },
      },
      include: callWithRelations,
    }));

  if (!existing) {
    const initiatorName = call.initiator?.displayName ?? 'Кто-то';
    pushService.notifyOfflineMembersOfCall(call.chatId, input.userId, initiatorName, call.kind).catch((error: unknown) => {
      logger.error({ err: error, chatId: call.chatId }, 'Не удалось отправить push-уведомления о звонке');
    });
  }

  const token = await issueAccessToken(call.id, input.userId);
  return { call: toCallDto(call), token, url: env.LIVEKIT_URL };
}

export async function joinCall(input: { callId: string; userId: string }): Promise<CallAccessDto> {
  const call = await getCallOrThrow(input.callId);
  await assertMember(call.chatId, input.userId);

  const now = new Date();
  await prisma.callParticipant.upsert({
    where: { callId_userId: { callId: call.id, userId: input.userId } },
    create: { callId: call.id, userId: input.userId, joinedAt: now },
    update: { joinedAt: now, leftAt: null },
  });

  const updated = await prisma.call.update({
    where: { id: call.id },
    data: call.status === 'RINGING' ? { status: 'ACTIVE', startedAt: call.startedAt ?? now } : {},
    include: callWithRelations,
  });

  const token = await issueAccessToken(call.id, input.userId);
  return { call: toCallDto(updated), token, url: env.LIVEKIT_URL };
}

export async function leaveCall(input: { callId: string; userId: string }): Promise<CallDto> {
  const call = await getCallOrThrow(input.callId);
  await assertMember(call.chatId, input.userId);

  await prisma.callParticipant.updateMany({
    where: { callId: call.id, userId: input.userId, leftAt: null },
    data: { leftAt: new Date() },
  });

  return toCallDto(await getCallOrThrow(call.id));
}

export async function endCall(input: { callId: string; userId: string; status: CallStatus }): Promise<CallDto> {
  const call = await getCallOrThrow(input.callId);
  await assertMember(call.chatId, input.userId);

  if (!ACTIVE_STATUSES.includes(call.status)) return toCallDto(call);

  const now = new Date();
  const updated = await prisma.call.update({
    where: { id: call.id },
    data: {
      status: input.status,
      endedAt: now,
      participants: { updateMany: { where: { leftAt: null }, data: { leftAt: now } } },
    },
    include: callWithRelations,
  });

  await prisma.message.create({
    data: {
      chatId: updated.chatId,
      senderId: updated.initiatorId,
      type: 'CALL',
      callId: updated.id,
      clientId: `call:${updated.id}`,
    },
    include: messageInclude,
  });

  return toCallDto(updated);
}

export async function getActiveCall(chatId: string, userId: string): Promise<CallDto | null> {
  await assertMember(chatId, userId);

  const call = await prisma.call.findFirst({
    where: { chatId, status: { in: ACTIVE_STATUSES } },
    include: callWithRelations,
  });
  return call ? toCallDto(call) : null;
}

export async function getCall(callId: string): Promise<CallDto> {
  return toCallDto(await getCallOrThrow(callId));
}

export async function getLiveCallsForParticipant(userId: string): Promise<CallDto[]> {
  const calls = await prisma.call.findMany({
    where: { status: { in: ACTIVE_STATUSES }, participants: { some: { userId, leftAt: null } } },
    include: callWithRelations,
  });
  return calls.map(toCallDto);
}
