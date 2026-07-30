import { setAvatarSchema } from '@messenger/shared';
import { Router } from 'express';

import { getUserById, setAvatar, toPublicUser } from '../../services/user.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const usersRouter: Router = Router();

usersRouter.use(requireAuth);

usersRouter.get('/me', (req, res, next) => {
  getUserById(req.userId!)
    .then((user) => res.json(toPublicUser(user)))
    .catch(next);
});

usersRouter.post('/me/avatar', validateBody(setAvatarSchema), (req, res, next) => {
  setAvatar(req.userId!, req.body.fileId, req.body.sha256)
    .then((user) => res.json(user))
    .catch(next);
});
