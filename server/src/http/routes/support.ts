import { Router } from 'express';

import { subscribeUserToChat, syncPresenceBetween } from '../../realtime/index.js';
import { ensureSupportChat } from '../../services/support.js';
import { requireAuth } from '../middleware/auth.js';

export const supportRouter: Router = Router();

supportRouter.use(requireAuth);

supportRouter.post('/chat', (req, res, next) => {
  const userId = req.userId!;

  ensureSupportChat(userId)
    .then(async ({ chatId, isNew, targetUserId }) => {
      await Promise.all([subscribeUserToChat(userId, chatId), subscribeUserToChat(targetUserId, chatId)]);
      if (isNew) await syncPresenceBetween(userId, targetUserId);
      res.status(isNew ? 201 : 200).json({ chatId });
    })
    .catch(next);
});
