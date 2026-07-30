import type { MessageDto } from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { badRequest } from '../lib/errors.js';
import { assertMember } from './chat.js';
import type { Message, User } from '../generated/prisma/client.js';

type MessageWithSender = Message & { sender: User | null };

export function toMessageDto(message: MessageWithSender): MessageDto {
  return {
    id: message.id,
    chatId: message.chatId,
    clientId: message.clientId,
    sender: message.sender
      ? {
          id: message.sender.id,
          username: message.sender.username,
          displayName: message.sender.displayName,
          avatarUrl: message.sender.avatarUrl,
        }
      : null,
    type: message.type,
    content: message.content,
    replyToId: message.replyToId,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

export interface SendMessageInput {
  chatId: string;
  senderId: string;
  clientId: string;
  content: string;
  replyToId?: number;
}

/** Единственный способ создать сообщение — вызывается только из socket-хендлера (секция 3). */
export async function sendMessage(input: SendMessageInput): Promise<MessageDto> {
  await assertMember(input.chatId, input.senderId);

  const existing = await prisma.message.findUnique({
    where: { clientId: input.clientId },
    include: { sender: true },
  });
  // Повтор отправки после обрыва сокета с тем же clientId — не создаёт дубль (секция 3).
  if (existing) return toMessageDto(existing);

  if (input.replyToId !== undefined) {
    const replyTarget = await prisma.message.findUnique({ where: { id: input.replyToId } });
    if (!replyTarget || replyTarget.chatId !== input.chatId) {
      throw badRequest(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение для ответа не найдено');
    }
  }

  const message = await prisma.message.create({
    data: {
      chatId: input.chatId,
      senderId: input.senderId,
      clientId: input.clientId,
      content: input.content,
      replyToId: input.replyToId,
    },
    include: { sender: true },
  });

  await prisma.chat.update({ where: { id: input.chatId }, data: { updatedAt: new Date() } });

  return toMessageDto(message);
}
