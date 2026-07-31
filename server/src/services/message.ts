import type {
  AttachmentDto,
  MessageAttachmentInput,
  MessageDto,
  MessageReactionDto,
  MessageReplyPreviewDto,
} from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { fileUrl } from '../lib/fileUrl.js';
import { assertMember } from './chat.js';
import { assertFileOwnershipProof, toFileDto } from './file.js';
import type { Attachment, File, Message, Reaction, User } from '../generated/prisma/client.js';

type ReplyWithRelations = Message & { sender: User | null; attachments: { id: string }[] };

export type MessageWithRelations = Message & {
  sender: User | null;
  attachments: (Attachment & { file: File; thumbnail: File | null })[];
  reactions: Reaction[];
  replyTo: ReplyWithRelations | null;
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

/** Группирует реакции по эмодзи в порядке первого появления — стабильный порядок пилюль в UI. */
function toReactionDtos(reactions: Reaction[]): MessageReactionDto[] {
  const order: string[] = [];
  const userIdsByEmoji = new Map<string, string[]>();

  for (const reaction of [...reactions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (!userIdsByEmoji.has(reaction.emoji)) {
      userIdsByEmoji.set(reaction.emoji, []);
      order.push(reaction.emoji);
    }
    userIdsByEmoji.get(reaction.emoji)!.push(reaction.userId);
  }

  return order.map((emoji) => ({ emoji, userIds: userIdsByEmoji.get(emoji)! }));
}

/** Цитата в ответе — снимок на момент запроса; при удалении оригинала контент скрывается так же, как в самом сообщении. */
function toReplyPreview(replyTo: ReplyWithRelations | null): MessageReplyPreviewDto | null {
  if (!replyTo) return null;
  const deleted = !!replyTo.deletedAt;

  return {
    id: replyTo.id,
    senderName: replyTo.sender?.displayName ?? 'Удалённый аккаунт',
    content: deleted ? null : replyTo.content,
    hasAttachment: !deleted && replyTo.attachments.length > 0,
    deletedAt: replyTo.deletedAt?.toISOString() ?? null,
  };
}

export function toMessageDto(message: MessageWithRelations): MessageDto {
  const deleted = !!message.deletedAt;

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
    // Мягкое удаление: content и вложение скрываются в DTO, строка в БД остаётся ради целостности цитат (секция 2).
    content: deleted ? null : message.content,
    attachment: deleted ? null : (message.attachments[0] ? toAttachmentDto(message.attachments[0]) : null),
    replyToId: message.replyToId,
    replyTo: toReplyPreview(message.replyTo),
    reactions: deleted ? [] : toReactionDtos(message.reactions),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

export const messageInclude = {
  sender: true,
  attachments: { include: { file: true, thumbnail: true } },
  reactions: true,
  replyTo: { include: { sender: true, attachments: { select: { id: true } } } },
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

async function getMessageInChatOrThrow(chatId: string, messageId: number): Promise<Message> {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.chatId !== chatId) {
    throw notFound(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение не найдено');
  }
  return message;
}

export interface EditMessageInput {
  chatId: string;
  messageId: number;
  userId: string;
  content: string;
}

/** Правка — только автор, только пока сообщение не удалено (секция 6). */
export async function editMessage(input: EditMessageInput): Promise<MessageDto> {
  await assertMember(input.chatId, input.userId);
  const existing = await getMessageInChatOrThrow(input.chatId, input.messageId);

  if (existing.deletedAt) throw badRequest(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение удалено');
  if (existing.senderId !== input.userId) throw forbidden('Можно редактировать только свои сообщения');

  const message = await prisma.message.update({
    where: { id: input.messageId },
    data: { content: input.content, editedAt: new Date() },
    include: messageInclude,
  });
  return toMessageDto(message);
}

export interface DeleteMessageInput {
  chatId: string;
  messageId: number;
  userId: string;
}

/** Удаление — своё может удалить автор; право админа группы добавится вместе с ролями в этапе 7. */
export async function deleteMessage(input: DeleteMessageInput): Promise<MessageDto> {
  await assertMember(input.chatId, input.userId);
  const existing = await getMessageInChatOrThrow(input.chatId, input.messageId);

  if (existing.senderId !== input.userId) throw forbidden('Можно удалить только свои сообщения');

  const message = existing.deletedAt
    ? await prisma.message.findUniqueOrThrow({ where: { id: input.messageId }, include: messageInclude })
    : await prisma.message.update({
        where: { id: input.messageId },
        data: { content: null, deletedAt: new Date() },
        include: messageInclude,
      });
  return toMessageDto(message);
}

export interface ReactToMessageInput {
  chatId: string;
  messageId: number;
  userId: string;
  emoji: string;
}

/** Тоггл: повтор той же реакции снимает её. Эмодзи ограничен REACTION_EMOJIS схемой ещё до сервиса. */
export async function reactToMessage(input: ReactToMessageInput): Promise<MessageReactionDto[]> {
  await assertMember(input.chatId, input.userId);
  const existing = await getMessageInChatOrThrow(input.chatId, input.messageId);
  if (existing.deletedAt) throw badRequest(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение удалено');

  const reactionKey = {
    messageId_userId_emoji: { messageId: input.messageId, userId: input.userId, emoji: input.emoji },
  };
  const already = await prisma.reaction.findUnique({ where: reactionKey });
  if (already) {
    await prisma.reaction.delete({ where: reactionKey });
  } else {
    await prisma.reaction.create({ data: { messageId: input.messageId, userId: input.userId, emoji: input.emoji } });
  }

  const reactions = await prisma.reaction.findMany({
    where: { messageId: input.messageId },
    orderBy: { createdAt: 'asc' },
  });
  return toReactionDtos(reactions);
}
