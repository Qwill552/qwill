import { pushSubscribeSchema, pushUnsubscribeSchema } from '@messenger/shared';
import { Router } from 'express';

import * as pushService from '../../services/push.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const pushRouter: Router = Router();

pushRouter.use(requireAuth);

pushRouter.post('/subscribe', validateBody(pushSubscribeSchema), (req, res, next) => {
  pushService
    .subscribe(req.userId!, { endpoint: req.body.endpoint, p256dh: req.body.keys.p256dh, auth: req.body.keys.auth })
    .then(() => res.status(201).end())
    .catch(next);
});

pushRouter.delete('/subscribe', validateBody(pushUnsubscribeSchema), (req, res, next) => {
  pushService
    .unsubscribe(req.userId!, req.body.endpoint)
    .then(() => res.status(204).end())
    .catch(next);
});
