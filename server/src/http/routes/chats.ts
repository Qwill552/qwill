import {
  addMemberSchema,
  chatAttachmentsQuerySchema,
  chatCalendarQuerySchema,
  chatLinksQuerySchema,
  chatMessageAtDateQuerySchema,
  chatMuteSchema,
  chatSearchQuerySchema,
  createGroupSchema,
  createPrivateChatSchema,
  deleteChatQuerySchema,
  ErrorCode,
  messagesAroundQuerySchema,
  messagesQuerySchema,
  messagesSyncQuerySchema,
  SocketEvent,
  updateGroupSchema,
  updateRoleSchema,
  type ChatDeletedEvent,
  type ChatMutedEvent,
} from '@messenger/shared';
import type { Request } from 'express';
import { Router } from 'express';

import { badRequest } from '../../lib/errors.js';
import { parseOrThrow } from '../../lib/validate.js';
import { emitChatUpdated, emitMemberChanged } from '../../realtime/group-handlers.js';
import {
  emitToChat,
  emitToUser,
  subscribeUserToChat,
  syncPresenceBetween,
  unsubscribeUserFromChat,
} from '../../realtime/index.js';
import * as chatCalendarService from '../../services/chatCalendar.js';
import * as chatMediaService from '../../services/chatMedia.js';
import * as chatService from '../../services/chat.js';
import * as groupService from '../../services/group.js';
import * as messageService from '../../services/message.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const chatsRouter: Router = Router();

chatsRouter.use(requireAuth);

// Как и в filesRouter — доп. middleware (validateBody) в цепочке иногда лишает TS литерального
// вывода параметров маршрута, req.params.* типизируется как string | string[] | undefined.
function paramId(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

chatsRouter.get('/', (req, res, next) => {
  chatService
    .listChats(req.userId!)
    .then((chats) => res.json({ chats }))
    .catch(next);
});

chatsRouter.post('/private', validateBody(createPrivateChatSchema), (req, res, next) => {
  const userId = req.userId!;

  chatService
    .getOrCreatePrivateChat(userId, req.body.username)
    .then(async ({ chatId, isNew, targetUserId }) => {
      const dto = await chatService.getChatDetail(chatId, userId);

      // Обе стороны должны быть в комнате чата сразу, а не при следующем реконнекте сокета.
      await Promise.all([subscribeUserToChat(userId, chatId), subscribeUserToChat(targetUserId, chatId)]);

      if (isNew) {
        // Иначе онлайн-статус собеседника узнаётся только после переподключения (секция 3).
        await syncPresenceBetween(userId, targetUserId);
      }

      res.status(isNew ? 201 : 200).json(dto);
    })
    .catch(next);
});

chatsRouter.post('/group', validateBody(createGroupSchema), (req, res, next) => {
  const userId = req.userId!;

  chatService
    .createGroupChat(userId, req.body.title, req.body.usernames)
    .then(async ({ chatId, memberIds }) => {
      await Promise.all(memberIds.map((memberId) => subscribeUserToChat(memberId, chatId)));

      const dto = await chatService.getChatDetail(chatId, userId);
      for (const memberId of memberIds) {
        if (memberId === userId) continue;
        const dtoForMember = await chatService.getChatDetail(chatId, memberId);
        emitToUser(memberId, SocketEvent.ChatCreated, dtoForMember);
      }

      res.status(201).json(dto);
    })
    .catch(next);
});

chatsRouter.get('/:id', (req, res, next) => {
  chatService
    .getChatDetail(req.params.id, req.userId!)
    .then((dto) => res.json(dto))
    .catch(next);
});

chatsRouter.get('/:id/messages', (req, res, next) => {
  try {
    const { before, after, limit } = parseOrThrow(messagesQuerySchema, req.query);
    chatService
      .getMessages(req.params.id, req.userId!, { before, after }, limit)
      .then((page) => res.json(page))
      .catch(next);
  } catch (error) {
    next(error);
  }
});

chatsRouter.get('/:id/messages/around/:messageId', (req, res, next) => {
  try {
    const { limit } = parseOrThrow(messagesAroundQuerySchema, req.query);
    const messageId = Number.parseInt(paramId(req, 'messageId'), 10);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) {
      throw badRequest(ErrorCode.VALIDATION_FAILED, 'Некорректный номер сообщения');
    }
    chatService
      .getMessagesAround(paramId(req, 'id'), req.userId!, messageId, limit)
      .then((window) => res.json(window))
      .catch(next);
  } catch (error) {
    next(error);
  }
});

chatsRouter.get('/:id/messages/search', (req, res, next) => {
  try {
    const { q, before, limit, fromUserId } = parseOrThrow(chatSearchQuerySchema, req.query);
    messageService
      .searchMessagesInChat(paramId(req, 'id'), req.userId!, q, { before }, limit, fromUserId)
      .then((result) => res.json(result))
      .catch(next);
  } catch (error) {
    next(error);
  }
});

chatsRouter.get('/:id/messages/at-date', (req, res, next) => {
  try {
    const query = parseOrThrow(chatMessageAtDateQuerySchema, req.query);
    chatCalendarService
      .firstMessageAtDate(paramId(req, 'id'), req.userId!, query)
      .then((found) => res.json(found))
      .catch(next);
  } catch (error) {
    next(error);
  }
});

chatsRouter.get('/:id/sync', (req, res, next) => {
  try {
    const query = parseOrThrow(messagesSyncQuerySchema, req.query);
    messageService
      .syncMessages({
        chatId: paramId(req, 'id'),
        userId: req.userId!,
        sinceId: query.sinceId,
        sinceUpdatedAt: query.sinceUpdatedAt ? new Date(query.sinceUpdatedAt) : null,
      })
      .then((result) => res.json(result))
      .catch(next);
  } catch (error) {
    next(error);
  }
});

chatsRouter.get('/:id/attachments', (req, res, next) => {
  try {
    const query = parseOrThrow(chatAttachmentsQuerySchema, req.query);
    chatMediaService
      .listChatAttachments(paramId(req, 'id'), req.userId!, query)
      .then((page) => res.json(page))
      .catch(next);
  } catch (error) {
    next(error);
  }
});

chatsRouter.get('/:id/attachments/counts', (req, res, next) => {
  chatMediaService
    .countChatAttachments(paramId(req, 'id'), req.userId!)
    .then((counts) => res.json(counts))
    .catch(next);
});

chatsRouter.get('/:id/calendar', (req, res, next) => {
  try {
    const query = parseOrThrow(chatCalendarQuerySchema, req.query);
    chatCalendarService
      .getChatCalendar(paramId(req, 'id'), req.userId!, query)
      .then((calendar) => res.json(calendar))
      .catch(next);
  } catch (error) {
    next(error);
  }
});

chatsRouter.get('/:id/links', (req, res, next) => {
  try {
    const query = parseOrThrow(chatLinksQuerySchema, req.query);
    chatMediaService
      .listChatLinks(paramId(req, 'id'), req.userId!, query)
      .then((page) => res.json(page))
      .catch(next);
  } catch (error) {
    next(error);
  }
});

chatsRouter.delete('/:id', (req, res, next) => {
  const chatId = paramId(req, 'id');
  const userId = req.userId!;

  try {
    const { forEveryone } = parseOrThrow(deleteChatQuerySchema, req.query);

    chatService
      .deleteChat(chatId, userId, forEveryone)
      .then(async (result) => {
        const event: ChatDeletedEvent = { chatId };
        if (result.forEveryone) {
          emitToChat(chatId, SocketEvent.ChatDeleted, event);
          await Promise.all(result.memberIds.map((memberId) => unsubscribeUserFromChat(memberId, chatId)));
        } else {
          emitToUser(userId, SocketEvent.ChatDeleted, event);
        }
        res.status(204).end();
      })
      .catch(next);
  } catch (error) {
    next(error);
  }
});

chatsRouter.delete('/:id/if-empty', (req, res, next) => {
  const chatId = paramId(req, 'id');
  const userId = req.userId!;

  chatService
    .dropEmptyPrivateChat(chatId, userId)
    .then(() => res.status(204).end())
    .catch(next);
});

chatsRouter.patch('/:id', validateBody(updateGroupSchema), (req, res, next) => {
  const chatId = paramId(req, 'id');

  chatService
    .updateGroup(chatId, req.userId!, req.body)
    .then((chat) => {
      emitChatUpdated(chatId, chat);
      res.json(chat);
    })
    .catch(next);
});

chatsRouter.patch('/:id/mute', validateBody(chatMuteSchema), (req, res, next) => {
  const chatId = paramId(req, 'id');
  const userId = req.userId!;

  chatService
    .setChatMuted(chatId, userId, req.body.muted)
    .then((muted) => {
      const event: ChatMutedEvent = { chatId, muted };
      emitToUser(userId, SocketEvent.ChatMuted, event);
      res.json({ muted });
    })
    .catch(next);
});

chatsRouter.get('/:id/members', (req, res, next) => {
  groupService
    .getMembers(req.params.id, req.userId!)
    .then((members) => res.json({ members }))
    .catch(next);
});

chatsRouter.post('/:id/members', validateBody(addMemberSchema), (req, res, next) => {
  const chatId = paramId(req, 'id');

  groupService
    .addMember(chatId, req.body.username, req.userId!)
    .then(async (member) => {
      await subscribeUserToChat(member.userId, chatId);
      // Остальным участникам — только строка в списке участников; добавленному — весь ChatDto,
      // иначе чат не появится в его списке чатов (он видит его впервые, у него нет entry в chats).
      emitMemberChanged(chatId, { type: 'added', chatId, member });
      const dtoForMember = await chatService.getChatDetail(chatId, member.userId);
      emitToUser(member.userId, SocketEvent.ChatCreated, dtoForMember);
      res.status(201).json(member);
    })
    .catch(next);
});

chatsRouter.delete('/:id/members/:userId', (req, res, next) => {
  const chatId = req.params.id;
  const targetUserId = req.params.userId;

  groupService
    .removeMember(chatId, targetUserId, req.userId!)
    .then(async () => {
      emitMemberChanged(chatId, { type: 'removed', chatId, userId: targetUserId });
      // После broadcast — иначе исключённый не увидит событие о себе (секция 8).
      await unsubscribeUserFromChat(targetUserId, chatId);
      res.status(204).end();
    })
    .catch(next);
});

chatsRouter.patch('/:id/members/:userId', validateBody(updateRoleSchema), (req, res, next) => {
  const chatId = paramId(req, 'id');
  const targetUserId = paramId(req, 'userId');

  groupService
    .updateMemberRole(chatId, targetUserId, req.body.role, req.userId!)
    .then((member) => {
      emitMemberChanged(chatId, { type: 'role', chatId, userId: member.userId, role: member.role });
      res.json(member);
    })
    .catch(next);
});

chatsRouter.post('/:id/leave', (req, res, next) => {
  const chatId = req.params.id;
  const userId = req.userId!;

  groupService
    .leaveGroup(chatId, userId)
    .then(async () => {
      emitMemberChanged(chatId, { type: 'left', chatId, userId });
      await unsubscribeUserFromChat(userId, chatId);
      res.status(204).end();
    })
    .catch(next);
});

// Целевой пользователь передаётся тем же полем username, что и в addMemberSchema (та же форма: один @username в теле).
chatsRouter.post('/:id/transfer-ownership', validateBody(addMemberSchema), (req, res, next) => {
  const chatId = paramId(req, 'id');

  groupService
    .transferOwnership(chatId, req.body.username, req.userId!)
    .then((members) => {
      for (const member of members) {
        emitMemberChanged(chatId, { type: 'role', chatId, userId: member.userId, role: member.role });
      }
      res.json({ members });
    })
    .catch(next);
});
