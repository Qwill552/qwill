import { createPrivateChatSchema, messagesQuerySchema, SocketEvent } from '@messenger/shared';
import { Router } from 'express';

import { parseOrThrow } from '../../lib/validate.js';
import { emitToUser, subscribeUserToChat } from '../../realtime/index.js';
import * as chatService from '../../services/chat.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const chatsRouter: Router = Router();

chatsRouter.use(requireAuth);

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
        const dtoForTarget = await chatService.getChatDetail(chatId, targetUserId);
        emitToUser(targetUserId, SocketEvent.ChatCreated, dtoForTarget);
      }

      res.status(isNew ? 201 : 200).json(dto);
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
    const { before, limit } = parseOrThrow(messagesQuerySchema, req.query);
    chatService
      .getMessages(req.params.id, req.userId!, before, limit)
      .then((page) => res.json(page))
      .catch(next);
  } catch (error) {
    next(error);
  }
});
