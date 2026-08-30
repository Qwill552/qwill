import {
  adminLogQuerySchema,
  adminUpdateProfileSchema,
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
  clearUserAvatar,
  clearUserBio,
  clearUserCard,
  findAdminUserCardByUsername,
  getAdminSettings,
  getAdminUserCard,
  listAdminLog,
  listReports,
  revealUserPii,
  revokeUserSessions,
  setProfileCardsEnabled,
  setUserCardDisabled,
  setUserDisplayName,
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

function paramUsername(req: Request): string {
  const value = req.params.username;
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

adminRouter.get('/users/by-username/:username', (req, res, next) => {
  findAdminUserCardByUsername(paramUsername(req))
    .then((user) => res.json(user))
    .catch(next);
});

adminRouter.get('/users/:id', (req, res, next) => {
  getAdminUserCard(paramId(req))
    .then((user) => res.json(user))
    .catch(next);
});

adminRouter.get('/users/:id/pii', (req, res, next) => {
  revealUserPii(adminActor(req), paramId(req))
    .then((pii) => res.json(pii))
    .catch(next);
});

adminRouter.patch('/users/:id/profile', validateBody(adminUpdateProfileSchema), (req, res, next) => {
  setUserDisplayName(adminActor(req), paramId(req), req.body.displayName)
    .then((user) => res.json(user))
    .catch(next);
});

adminRouter.delete('/users/:id/avatar', (req, res, next) => {
  clearUserAvatar(adminActor(req), paramId(req))
    .then((user) => res.json(user))
    .catch(next);
});

adminRouter.delete('/users/:id/card/content', (req, res, next) => {
  clearUserCard(adminActor(req), paramId(req))
    .then((user) => res.json(user))
    .catch(next);
});

adminRouter.delete('/users/:id/bio', (req, res, next) => {
  clearUserBio(adminActor(req), paramId(req))
    .then((user) => res.json(user))
    .catch(next);
});

adminRouter.post('/users/:id/sessions/revoke', (req, res, next) => {
  revokeUserSessions(adminActor(req), paramId(req))
    .then(async (user) => {
      await disconnectUserSockets(user.id);
      res.json(user);
    })
    .catch(next);
});

adminRouter.get('/log', (req, res, next) => {
  const query = parseOrThrow(adminLogQuerySchema, req.query);
  listAdminLog(query)
    .then((page) => res.json(page))
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
