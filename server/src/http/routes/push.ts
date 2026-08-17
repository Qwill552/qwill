import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  SocketEvent,
  type PushSubscribeInput,
  type PushUnsubscribeInput,
} from '@messenger/shared';
import { Router } from 'express';

import { logger } from '../../lib/logger.js';
import { emitToUser, subscribeUserToChat } from '../../realtime/index.js';
import * as announcementService from '../../services/announcements.js';
import * as chatService from '../../services/chat.js';
import * as pushService from '../../services/push.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const pushRouter: Router = Router();

pushRouter.use(requireAuth);

/** Подписка с provider: 'fcm' — и есть признак «пользуется Android-приложением»: только у таких
 *  людей появляется чат Qwill с объявлениями о выпусках (updates/03-announcements-chat.md).
 *  Ошибка на этом шаге не должна валить саму подписку на пуши — она важнее чата. */
async function ensureAnnouncementChat(userId: string): Promise<void> {
  const chat = await announcementService.ensureServiceChat(userId);
  if (!chat) return;

  await subscribeUserToChat(userId, chat.chatId);
  if (!chat.isNew) return;

  const dto = await chatService.getChatDetail(chat.chatId, userId);
  emitToUser(userId, SocketEvent.ChatCreated, dto);
}

pushRouter.post('/subscribe', validateBody(pushSubscribeSchema), (req, res, next) => {
  const input: PushSubscribeInput = req.body;
  const userId = req.userId!;
  const target =
    input.provider === 'fcm'
      ? { provider: 'fcm' as const, token: input.token }
      : { provider: 'webpush' as const, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth };

  pushService
    .subscribe(userId, target)
    .then(async () => {
      if (input.provider === 'fcm') {
        await ensureAnnouncementChat(userId).catch((error: unknown) => {
          logger.error({ err: error, userId }, 'Не удалось создать чат с объявлениями об обновлениях');
        });
      }
      res.status(201).end();
    })
    .catch(next);
});

pushRouter.delete('/subscribe', validateBody(pushUnsubscribeSchema), (req, res, next) => {
  const input: PushUnsubscribeInput = req.body;
  const target = input.provider === 'fcm' ? { provider: 'fcm' as const, token: input.token } : { provider: 'webpush' as const, endpoint: input.endpoint };

  pushService
    .unsubscribe(req.userId!, target)
    .then(() => res.status(204).end())
    .catch(next);
});
