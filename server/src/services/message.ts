import type { AttachmentDto, MessageAttachmentInput, MessageDto } from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { badRequest } from '../lib/errors.js';
import { fileUrl } from '../lib/fileUrl.js';
import { assertMember } from './chat.js';
import { assertFileOwnershipProof, toFileDto } from './file.js';
import type { Attachment, File, Message, User } from '../generated/prisma/client.js';

type MessageWithRelations = Message & {
  sender: User | null;
  attachments: (Attachment & { file: File; thumbnail: File | null })[];
};

function toAttachmentDto(attachment: Attachment & { file: File; thumbnail: File | null }): AttachmentDto {
  return {
    id: attachment.id,
    file: toFileDto(attachment.file),
    thumbnail: attachment.thumbnail ? toFileDto(attachment.thumbnail) : null,
    originalName: attachment.originalName,
    width: attachment.width,
    height: attachment.height,
    duration: attachment.duration,
  };
}

export function toMessageDto(message: MessageWithRelations): MessageDto {
  return {
    id: message.id,
    chatId: message.chatId,
    clientId: message.clientId,
    sender: message.sender
      ? {
          id: message.sender.id,
          username: message.sender.username,
          displayName: message.sender.displayName,
          avatarUrl: fileUrl(message.sender.avatarFileId),
          lastSeenAt: message.sender.lastSeenAt.toISOString(),
        }
      : null,
    type: message.type,
    content: message.content,
    attachment: message.attachments[0] ? toAttachmentDto(message.attachments[0]) : null,
    replyToId: message.replyToId,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

export const messageInclude = {
  sender: true,
  attachments: { include: { file: true, thumbnail: true } },
} as const;

export interface SendMessageInput {
  chatId: string;
  senderId: string;
  clientId: string;
  content?: string;
  replyToId?: number;
  attachment?: MessageAttachmentInput;
}

/** Единственный способ создать сообщение — вызывается только из socket-хендлера (секция 3). */
export async function sendMessage(input: SendMessageInput): Promise<MessageDto> {
  await assertMember(input.chatId, input.senderId);

  const existing = await prisma.message.findUnique({
    where: { clientId: input.clientId },
    include: messageInclude,
  });
  // Повтор отправки после обрыва сокета с тем же clientId — не создаёт дубль (секция 3).
  if (existing) return toMessageDto(existing);

  if (input.replyToId !== undefined) {
    const replyTarget = await prisma.message.findUnique({ where: { id: input.replyToId } });
    if (!replyTarget || replyTarget.chatId !== input.chatId) {
      throw badRequest(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение для ответа не найдено');
    }
  }

  const attachmentCreate = input.attachment ? await buildAttachmentCreate(input.attachment) : null;

  const message = await prisma.message.create({
    data: {
      chatId: input.chatId,
      senderId: input.senderId,
      clientId: input.clientId,
      content: input.content ?? null,
      type: input.attachment ? 'MEDIA' : 'TEXT',
      replyToId: input.replyToId,
      ...(attachmentCreate ? { attachments: { create: attachmentCreate } } : {}),
    },
    include: messageInclude,
  });

  await prisma.chat.update({ where: { id: input.chatId }, data: { updatedAt: new Date() } });

  return toMessageDto(message);
}

/** Проверяет доказательство владения содержимым (и превью, если есть) до того, как разрешить вложить файл в сообщение. */
async function buildAttachmentCreate(input: MessageAttachmentInput) {
  await assertFileOwnershipProof(input.fileId, input.sha256);
  if (input.thumbnailFileId) {
    if (!input.thumbnailSha256) {
      throw badRequest(ErrorCode.VALIDATION_FAILED, 'Не хватает sha256 превью');
    }
    await assertFileOwnershipProof(input.thumbnailFileId, input.thumbnailSha256);
  }

  return {
    fileId: input.fileId,
    thumbnailFileId: input.thumbnailFileId,
    originalName: input.originalName,
    width: input.width,
    height: input.height,
    duration: input.duration,
  };
}
