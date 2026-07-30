import { Router } from 'express';

import { getUserById, toPublicUser } from '../../services/user.js';
import { requireAuth } from '../middleware/auth.js';

export const usersRouter: Router = Router();

usersRouter.use(requireAuth);

usersRouter.get('/me', (req, res, next) => {
  getUserById(req.userId!)
    .then((user) => res.json(toPublicUser(user)))
    .catch(next);
});
