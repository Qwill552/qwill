import { PROFILE_CARD_MAX_BYTES, setAvatarSchema, updateProfileSchema, updateSettingsSchema } from '@messenger/shared';
import express, { Router } from 'express';

import {
  deleteCard,
  findVisibleCard,
  getOwnCardHtml,
  saveCard,
  savePreview,
} from '../../services/profileCard.js';
import {
  getSettings,
  getUserById,
  getUserProfile,
  setAvatar,
  toPublicUser,
  updateProfile,
  updateSettings,
} from '../../services/user.js';
import { requireAuth } from '../middleware/auth.js';
import { cardSaveLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';

export const usersRouter: Router = Router();

usersRouter.use(requireAuth);

/**
 * Визитка отдаётся как простой текст, а не как HTML: этот адрес живёт на домене приложения,
 * и открытый в адресной строке он не должен исполняться. `nosniff` запрещает браузеру
 * угадывать тип по содержимому, `attachment` добивает — файл предлагается скачать
 * (R-30, Граница 4).
 */
function sendCardAsText(res: express.Response, html: string): void {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'attachment; filename="card.html"');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
}

usersRouter.get('/me/card', (req, res, next) => {
  getOwnCardHtml(req.userId!)
    .then((html) => sendCardAsText(res, html))
    .catch(next);
});

usersRouter.put(
  '/me/card',
  cardSaveLimiter,
  // Мимо общего express.json({ limit: '1mb' }): визитка приезжает телом text/html, и поднимать
  // общий лимит ради неё нельзя — весь остальной API двухмегабайтные тела принимать не должен.
  express.text({ type: ['text/html', 'text/plain'], limit: PROFILE_CARD_MAX_BYTES }),
  (req, res, next) => {
    const html = typeof req.body === 'string' ? req.body : '';
    saveCard(req.userId!, html)
      .then((card) => sendCardAsText(res, card.html))
      .catch(next);
  },
);

usersRouter.put(
  '/me/card/preview',
  cardSaveLimiter,
  express.text({ type: ['text/html', 'text/plain'], limit: PROFILE_CARD_MAX_BYTES }),
  (req, res) => {
    const html = typeof req.body === 'string' ? req.body : '';
    res.json(savePreview(req.userId!, html));
  },
);

usersRouter.delete('/me/card', (req, res, next) => {
  deleteCard(req.userId!)
    .then(() => res.status(204).end())
    .catch(next);
});

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

usersRouter.get('/:id/profile', (req, res, next) => {
  getUserProfile(req.params.id)
    .then((profile) => res.json(profile))
    .catch(next);
});

usersRouter.get('/:id/card', (req, res, next) => {
  findVisibleCard(req.params.id)
    .then((card) => sendCardAsText(res, card?.html ?? ''))
    .catch(next);
});
