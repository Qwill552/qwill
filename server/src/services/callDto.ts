import type { CallDto, CallParticipantDto, CallStatus } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { toMemberSummary } from './userSummary.js';
import type { Call, CallParticipant, User } from '../generated/prisma/client.js';

export const ACTIVE_CALL_STATUSES: CallStatus[] = ['RINGING', 'ACTIVE'];

export const callWithRelations = {
  initiator: true,
  participants: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
} as const;

export type CallWithRelations = Call & {
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

export function toCallDto(call: CallWithRelations): CallDto {
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

export async function findActiveCall(chatId: string): Promise<CallDto | null> {
  const call = await prisma.call.findFirst({
    where: { chatId, status: { in: ACTIVE_CALL_STATUSES } },
    include: callWithRelations,
  });
  return call ? toCallDto(call) : null;
}
