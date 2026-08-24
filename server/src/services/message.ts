import type {
  AttachmentDto,
  MessageAnnouncementDto,
  MessageAttachmentInput,
  MessageCallDto,
  MessageDto,
  MessageForwardPreviewDto,
  MessageReactionDto,
  MessageReplyPreviewDto,
  MessagesSyncResponse,
} from '@messenger/shared';
import { ErrorCode } from '@messenger/shared';
import { randomUUID } from 'node:crypto';

import { prisma } from '../db/prisma.js';
import { toAvatarColor } from '../lib/avatarColor.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { fileUrl } from '../lib/fileUrl.js';
import { logger } from '../lib/logger.js';
import { presenceStore } from '../realtime/presence.js';
import { assertChatWritable, assertMember } from './chat.js';
import { assertFileOwnershipProof, toFileDto } from './file.js';
import * as pushService from './push.js';
import { ChatRole } from '../generated/prisma/client.js';
import type { Announcement, Attachment, Call, File, Message, Reaction, User } from '../generated/prisma/client.js';

type ReplyWithRelations = Message & { sender: User | null; attachments: { id: string }[] };
type ForwardOriginWithRelations = Message & { sender: User | null };

export type MessageWithRelations = Message & {
  sender: User | null;
  attachments: (Attachment & { file: File; thumbnail: File | null })[];
  reactions: Reaction[];
  replyTo: ReplyWithRelations | null;
  forwardedFrom: ForwardOriginWithRelations | null;
  call: Call | null;
  announcement: Announcement | null;
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
    peaks: attachment.peaks.length > 0 ? attachment.peaks : null,
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

/** Снимок автора оригинала при пересылке — само пересланное сообщение уже несёт своё
 *  содержимое, оригинал не нужен, даже если позже удалён. */
function toForwardPreview(forwardedFrom: ForwardOriginWithRelations | null): MessageForwardPreviewDto | null {
  if (!forwardedFrom) return null;
  return {
    id: forwardedFrom.id,
    senderName: forwardedFrom.sender?.displayName ?? 'Удалённый аккаунт',
  };
}

function toMessageAnnouncementDto(announcement: Announcement | null): MessageAnnouncementDto | null {
  if (!announcement) return null;

  return {
    id: announcement.id,
    versionCode: announcement.versionCode,
    versionName: announcement.versionName,
    changelog: announcement.changelog,
  };
}

function toMessageCallDto(call: Call | null): MessageCallDto | null {
  if (!call) return null;

  return {
    id: call.id,
    kind: call.kind,
    status: call.status,
    startedAt: call.startedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
  };
}

export function toMessageDto(message: MessageWithRelations): MessageDto {
  const deleted = !!message.deletedAt;

  return {
    id: message.id,
    chatId: message.chatId,
    clientId: message.clientId,
    albumId: message.albumId,
    sender: message.sender
      ? {
          id: message.sender.id,
          username: message.sender.username,
          displayName: message.sender.displayName,
          avatarUrl: fileUrl(message.sender.avatarFileId),
          avatarColor: toAvatarColor(message.sender.avatarColor),
          lastSeenAt: message.sender.lastSeenAt.toISOString(),
          isService: message.sender.isService,
        }
      : null,
    type: message.type,
    // Мягкое удаление: content и вложение скрываются в DTO, строка в БД остаётся ради целостности цитат (секция 2).
    content: deleted ? null : message.content,
    attachment: deleted ? null : (message.attachments[0] ? toAttachmentDto(message.attachments[0]) : null),
    replyToId: message.replyToId,
    replyTo: toReplyPreview(message.replyTo),
    forwardedFrom: toForwardPreview(message.forwardedFrom),
    call: toMessageCallDto(message.call),
    announcement: deleted ? null : toMessageAnnouncementDto(message.announcement),
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
  forwardedFrom: { include: { sender: true } },
  call: true,
  announcement: true,
} as const;

export interface SendMessageInput {
  chatId: string;
  senderId: string;
  clientId: string;
  content?: string;
  replyToId?: number;
  attachment?: MessageAttachmentInput;
  albumId?: string;
  /** Заполняется только рассылкой объявлений (services/announcements.ts): сообщение получает
   *  тип ANNOUNCEMENT и ссылку на выпуск, из которой пузырь собирает себя сам. */
  announcementId?: string;
}

/** Единственный способ создать сообщение — вызывается только из socket-хендлера (секция 3). */
export async function sendMessage(input: SendMessageInput): Promise<MessageDto> {
  await assertMember(input.chatId, input.senderId);
  await assertChatWritable(input.chatId, input.senderId);

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
      albumId: input.albumId ?? null,
      content: input.content ?? null,
      type: input.announcementId ? 'ANNOUNCEMENT' : input.attachment ? 'MEDIA' : 'TEXT',
      announcementId: input.announcementId,
      replyToId: input.replyToId,
      ...(attachmentCreate ? { attachments: { create: attachmentCreate } } : {}),
    },
    include: messageInclude,
  });

  await prisma.chat.update({ where: { id: input.chatId }, data: { updatedAt: new Date() } });

  const dto = toMessageDto(message);
  // Не блокируем ack отправителю ожиданием push-провайдера — шлём в фоне (этап 9).
  notifyOfflineMembers(input.chatId, input.senderId, dto).catch((error: unknown) => {
    logger.error({ err: error, chatId: input.chatId }, 'Не удалось отправить push-уведомления о новом сообщении');
  });

  return dto;
}

/** Пуш всем, у кого нет видимой вкладки чата, кроме отправителя — сокет мог остаться подключён
 *  в фоне (свёрнутое приложение), но push всё равно нужен, раз человек сейчас не смотрит (этап 9). */
async function notifyOfflineMembers(chatId: string, senderId: string, message: MessageDto): Promise<void> {
  const members = await prisma.chatMember.findMany({
    where: { chatId, userId: { not: senderId }, mutedAt: null },
    select: { userId: true },
  });
  const offlineMemberIds = members.map((m) => m.userId).filter((userId) => !presenceStore.hasVisibleClient(userId));
  if (offlineMemberIds.length === 0) return;

  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { type: true, title: true } });
  const senderName = message.sender?.displayName ?? 'Кто-то';
  const title = chat?.type === 'GROUP' ? `${senderName} · ${chat.title ?? 'Группа'}` : senderName;
  const body = message.announcement
    ? `Новое обновление (${message.announcement.versionName})`
    : (message.content ?? (message.attachment ? 'Прислал(а) файл' : 'Новое сообщение'));

  await Promise.all(
    offlineMemberIds.map((userId) => pushService.sendToUser(userId, { title, body, chatId })),
  );
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
    peaks: input.peaks ?? [],
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

/** Правка — только автор, только текстовое сообщение, только пока оно не удалено (секция 6). */
export async function editMessage(input: EditMessageInput): Promise<MessageDto> {
  await assertMember(input.chatId, input.userId);
  const existing = await getMessageInChatOrThrow(input.chatId, input.messageId);

  if (existing.deletedAt) throw badRequest(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение удалено');
  if (existing.senderId !== input.userId) throw forbidden('Можно редактировать только свои сообщения');
  if (existing.type !== 'TEXT') throw forbidden('Изменить можно только текстовое сообщение');

  const message = await prisma.message.update({
    where: { id: input.messageId },
    data: { content: input.content, editedAt: new Date() },
    include: messageInclude,
  });
  return toMessageDto(message);
}

/** Своё может удалить автор; чужое в группе — OWNER/ADMIN (этап 6, ux-ui/06-message-interaction.md). */
async function assertCanDeleteMessage(chatId: string, userId: string, message: Message): Promise<void> {
  if (message.senderId === userId) return;

  const membership = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    include: { chat: { select: { type: true } } },
  });
  const isGroupAdmin =
    membership?.chat.type === 'GROUP' && (membership.role === ChatRole.OWNER || membership.role === ChatRole.ADMIN);
  if (!isGroupAdmin) throw forbidden('Можно удалить только свои сообщения');
}

export interface DeleteMessageInput {
  chatId: string;
  messageId: number;
  userId: string;
}

export async function deleteMessage(input: DeleteMessageInput): Promise<MessageDto> {
  await assertMember(input.chatId, input.userId);
  const existing = await getMessageInChatOrThrow(input.chatId, input.messageId);
  await assertCanDeleteMessage(input.chatId, input.userId, existing);

  const message = existing.deletedAt
    ? await prisma.message.findUniqueOrThrow({ where: { id: input.messageId }, include: messageInclude })
    : await prisma.message.update({
        where: { id: input.messageId },
        data: { content: null, deletedAt: new Date() },
        include: messageInclude,
      });
  return toMessageDto(message);
}

export interface DeleteMessagesBatchInput {
  chatId: string;
  userId: string;
  messageIds: number[];
}

/** Групповое удаление мультивыбора — один запрос вместо цикла message:delete (ux-ui/06, секция 3). */
export async function deleteMessagesBatch(input: DeleteMessagesBatchInput): Promise<MessageDto[]> {
  await assertMember(input.chatId, input.userId);

  const existing = await prisma.message.findMany({
    where: { id: { in: input.messageIds }, chatId: input.chatId },
  });
  if (existing.length !== input.messageIds.length) {
    throw notFound(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение не найдено');
  }
  for (const message of existing) {
    await assertCanDeleteMessage(input.chatId, input.userId, message);
  }

  const toDelete = existing.filter((m) => !m.deletedAt).map((m) => m.id);
  if (toDelete.length > 0) {
    await prisma.message.updateMany({
      where: { id: { in: toDelete } },
      data: { content: null, deletedAt: new Date() },
    });
  }

  const messages = await prisma.message.findMany({
    where: { id: { in: input.messageIds } },
    include: messageInclude,
    orderBy: { id: 'asc' },
  });
  return messages.map(toMessageDto);
}

export interface ForwardMessagesInput {
  fromChatId: string;
  toChatId: string;
  userId: string;
  messageIds: number[];
}

/** Пересылка копирует содержимое (и вложение — тот же File, дедупликация не страдает) в
 *  целевой чат от имени пересылающего; forwardedFromId сплющивает цепочку до самого первого
 *  оригинала — «Переслано от X» всегда указывает на первого автора, а не на посредника
 *  (ux-ui/06). Удалённые сообщения из выборки молча пропускаются, а не роняют весь запрос —
 *  мультивыбор мог зацепить то, что удалили параллельно. */
export async function forwardMessages(input: ForwardMessagesInput): Promise<MessageDto[]> {
  await assertMember(input.fromChatId, input.userId);
  await assertMember(input.toChatId, input.userId);
  await assertChatWritable(input.toChatId, input.userId);

  const sources = await prisma.message.findMany({
    where: { id: { in: input.messageIds }, chatId: input.fromChatId },
    include: messageInclude,
    orderBy: { id: 'asc' },
  });
  if (sources.length !== input.messageIds.length) {
    throw notFound(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщение не найдено');
  }

  const forwardable = sources.filter((m) => !m.deletedAt);
  if (forwardable.length === 0) {
    throw badRequest(ErrorCode.MESSAGE_NOT_FOUND, 'Сообщения удалены');
  }

  const created: MessageWithRelations[] = [];
  for (const source of forwardable) {
    const attachment = source.attachments[0];
    const message = await prisma.message.create({
      data: {
        chatId: input.toChatId,
        senderId: input.userId,
        clientId: randomUUID(),
        content: source.content,
        type: source.type,
        forwardedFromId: source.forwardedFromId ?? source.id,
        ...(attachment
          ? {
              attachments: {
                create: {
                  fileId: attachment.fileId,
                  thumbnailFileId: attachment.thumbnailFileId,
                  originalName: attachment.originalName,
                  width: attachment.width,
                  height: attachment.height,
                  duration: attachment.duration,
                  peaks: attachment.peaks,
                },
              },
            }
          : {}),
      },
      include: messageInclude,
    });
    created.push(message);
  }

  await prisma.chat.update({ where: { id: input.toChatId }, data: { updatedAt: new Date() } });
  return created.map(toMessageDto);
}

export interface SyncMessagesInput {
  chatId: string;
  userId: string;
  sinceId: number;
  sinceUpdatedAt: Date | null;
}

const SYNC_PAGE_SIZE = 200;

export async function syncMessages(input: SyncMessagesInput): Promise<MessagesSyncResponse> {
  await assertMember(input.chatId, input.userId);

  const created = await prisma.message.findMany({
    where: { chatId: input.chatId, id: { gt: input.sinceId } },
    include: messageInclude,
    orderBy: { id: 'asc' },
    take: SYNC_PAGE_SIZE + 1,
  });

  const changed = input.sinceUpdatedAt
    ? await prisma.message.findMany({
        where: {
          chatId: input.chatId,
          id: { lte: input.sinceId },
          updatedAt: { gt: input.sinceUpdatedAt },
        },
        include: messageInclude,
        orderBy: { updatedAt: 'asc' },
        take: SYNC_PAGE_SIZE,
      })
    : [];

  const hasMore = created.length > SYNC_PAGE_SIZE;
  const createdPage = hasMore ? created.slice(0, SYNC_PAGE_SIZE) : created;
  const all = [...createdPage, ...changed];

  return {
    created: createdPage.map(toMessageDto),
    changed: changed.map(toMessageDto),
    maxId: createdPage.length > 0 ? createdPage[createdPage.length - 1]!.id : null,
    maxUpdatedAt:
      all.length > 0 ? new Date(Math.max(...all.map((m) => m.updatedAt.getTime()))).toISOString() : null,
    hasMore,
  };
}

export interface ReactToMessageInput {
  chatId: string;
  messageId: number;
  userId: string;
  emoji: string;
}

/** Тоггл: повтор той же реакции снимает её. Эмодзи провалидирован messageReactSchema ещё до сервиса. */
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
