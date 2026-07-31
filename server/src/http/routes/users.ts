import { searchUsersQuerySchema, setAvatarSchema, updateProfileSchema, updateSettingsSchema } from '@messenger/shared';
import { Router } from 'express';

import { parseOrThrow } from '../../lib/validate.js';
import {
  getSettings,
  getUserById,
  searchUsers,
  setAvatar,
  toPublicUser,
  updateProfile,
  updateSettings,
} from '../../services/user.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const usersRouter: Router = Router();

usersRouter.use(requireAuth);

usersRouter.get('/me', (req, res, next) => {
  getUserById(req.userId!)
    .then((user) => res.json(toPublicUser(user)))
    .catch(next);
});

usersRouter.patch('/me', validateBody(updateProfileSchema), (req, res, next) => {
  updateProfile(req.userId!, req.body)
    .then((user) => res.json(user))
    .catch(next);
});

usersRouter.post('/me/avatar', validateBody(setAvatarSchema), (req, res, next) => {
  setAvatar(req.userId!, req.body.fileId, req.body.sha256)
    .then((user) => res.json(user))
    .catch(next);
});

usersRouter.get('/me/settings', (req, res, next) => {
  getSettings(req.userId!)
    .then((settings) => res.json(settings))
    .catch(next);
});

usersRouter.patch('/me/settings', validateBody(updateSettingsSchema), (req, res, next) => {
  updateSettings(req.userId!, req.body)
    .then((settings) => res.json(settings))
    .catch(next);
});

usersRouter.get('/search', (req, res, next) => {
  try {
    const { q } = parseOrThrow(searchUsersQuerySchema, req.query);
    searchUsers(q, req.userId!)
      .then((results) => res.json({ results }))
      .catch(next);
  } catch (error) {
    next(error);
  }
});
