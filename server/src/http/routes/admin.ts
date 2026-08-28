import {
  banUserSchema,
  reportListQuerySchema,
  setProfileCardsSchema,
  setUserCardSchema,
} from '@messenger/shared';
import { Router, type Request } from 'express';

import { parseOrThrow } from '../../lib/validate.js';
import { disconnectUserSockets } from '../../realtime/index.js';
import {
  banUser,
  findUserByUsername,
  getAdminSettings,
  listReports,
  setProfileCardsEnabled,
  setUserCardDisabled,
  unbanUser,
} from '../../services/admin.js';
import { adminActor, requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const adminRouter: Router = Router();

adminRouter.use(requireAuth, requireAdmin);

// Как и в chatsRouter: validateBody в цепочке лишает TS литерального вывода параметров маршрута.
function paramId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

adminRouter.get('/users', (req, res, next) => {
  const username = typeof req.query.username === 'string' ? req.query.username : '';
  findUserByUsername(username)
    .then((user) => res.json(user))
    .catch(next);
});

adminRouter.post('/users/:id/ban', validateBody(banUserSchema), (req, res, next) => {
  banUser(adminActor(req), paramId(req), req.body.reason)
    .then(async (user) => {
      await disconnectUserSockets(user.id);
      res.json(user);
    })
    .catch(next);
});

adminRouter.delete('/users/:id/ban', (req, res, next) => {
  unbanUser(adminActor(req), paramId(req))
    .then((user) => res.json(user))
    .catch(next);
});

adminRouter.patch('/users/:id/card', validateBody(setUserCardSchema), (req, res, next) => {
  setUserCardDisabled(adminActor(req), paramId(req), req.body.disabled)
    .then((user) => res.json(user))
    .catch(next);
});

adminRouter.get('/settings', (_req, res, next) => {
  getAdminSettings()
    .then((settings) => res.json(settings))
    .catch(next);
});

adminRouter.patch('/settings/profile-cards', validateBody(setProfileCardsSchema), (req, res, next) => {
  setProfileCardsEnabled(adminActor(req), req.body.enabled)
    .then((settings) => res.json(settings))
    .catch(next);
});

adminRouter.get('/reports', (req, res, next) => {
  const query = parseOrThrow(reportListQuerySchema, req.query);
  listReports(query.status)
    .then((reports) => res.json(reports))
    .catch(next);
});
