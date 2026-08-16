import { pushSubscribeSchema, pushUnsubscribeSchema, type PushSubscribeInput, type PushUnsubscribeInput } from '@messenger/shared';
import { Router } from 'express';

import * as pushService from '../../services/push.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const pushRouter: Router = Router();

pushRouter.use(requireAuth);

pushRouter.post('/subscribe', validateBody(pushSubscribeSchema), (req, res, next) => {
  const input: PushSubscribeInput = req.body;
  const target =
    input.provider === 'fcm'
      ? { provider: 'fcm' as const, token: input.token }
      : { provider: 'webpush' as const, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth };

  pushService
    .subscribe(req.userId!, target)
    .then(() => res.status(201).end())
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
