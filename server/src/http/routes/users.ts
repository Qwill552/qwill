import {
  CARD_IMAGE_MAX_BYTES,
  PROFILE_CARD_MAX_BYTES,
  SocketEvent,
  setAvatarSchema,
  updateProfileSchema,
  updateSettingsSchema,
  type ChatBlockEvent,
} from '@messenger/shared';
import express, { Router } from 'express';

import {
  addCardImage,
  cardImageTooLargeMessage,
  deleteCardImage,
  listCardImages,
} from '../../services/cardImages.js';
import { blockUser, invertBlockState, listBlocked, unblockUser, type BlockState } from '../../services/block.js';
import { privateChatIdBetween } from '../../services/chat.js';
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
  getUserProfileByUsername,
  setAvatar,
  toPublicUser,
  updateProfile,
  updateSettings,
} from '../../services/user.js';
import { tooLarge } from '../../lib/errors.js';
import { emitToUser } from '../../realtime/index.js';
import { requireAuth } from '../middleware/auth.js';
import { cardImageUploadLimiter, cardSaveLimiter } from '../middleware/rateLimit.js';
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

usersRouter.get('/me/card/images', (req, res, next) => {
  listCardImages(req.userId!)
    .then((list) => res.json(list))
    .catch(next);
});

const readCardImageBody = express.raw({ type: () => true, limit: CARD_IMAGE_MAX_BYTES });

/**
 * `express.raw` на превышении бросает ошибку body-parser, и общий обработчик отвечает
 * безликим «Слишком большой запрос» вместо цифр, которых требует ТЗ. Отказ до чтения тела
 * по заголовку `Content-Length` не годится: ответ уходит раньше, чем отправитель дописал
 * тело, и он получает обрыв соединения вместо сообщения.
 */
function readCardImage(req: express.Request, res: express.Response, next: express.NextFunction): void {
  readCardImageBody(req, res, (error: unknown) => {
    if (error && typeof error === 'object' && (error as { type?: unknown }).type === 'entity.too.large') {
      next(tooLarge(cardImageTooLargeMessage(Number(req.headers['content-length'] ?? 0))));
      return;
    }
    next(error);
  });
}

usersRouter.post(
  '/me/card/images',
  cardImageUploadLimiter,
  readCardImage,
  (req, res, next) => {
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    const replace = req.query.replace === '1';
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    addCardImage(req.userId!, name, body, replace)
      .then((image) => res.status(201).json(image))
      .catch(next);
  },
);

usersRouter.delete('/me/card/images/:name', (req, res, next) => {
  deleteCardImage(req.userId!, String(req.params.name ?? ''))
    .then(() => res.status(204).end())
    .catch(next);
});

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

async function broadcastBlockState(userId: string, otherId: string, state: BlockState): Promise<void> {
  const chatId = await privateChatIdBetween(userId, otherId);
  if (!chatId) return;

  const mine: ChatBlockEvent = { chatId, userId: otherId, ...state };
  const theirs: ChatBlockEvent = { chatId, userId, ...invertBlockState(state) };
  emitToUser(userId, SocketEvent.ChatBlock, mine);
  emitToUser(otherId, SocketEvent.ChatBlock, theirs);
}

usersRouter.get('/me/blocked', (req, res, next) => {
  listBlocked(req.userId!)
    .then((users) => res.json(users))
    .catch(next);
});

usersRouter.post('/:id/block', (req, res, next) => {
  const userId = req.userId!;
  const otherId = String(req.params.id);

  blockUser(userId, otherId)
    .then(async (state) => {
      await broadcastBlockState(userId, otherId, state);
      res.json(state);
    })
    .catch(next);
});

usersRouter.delete('/:id/block', (req, res, next) => {
  const userId = req.userId!;
  const otherId = String(req.params.id);

  unblockUser(userId, otherId)
    .then(async (state) => {
      await broadcastBlockState(userId, otherId, state);
      res.json(state);
    })
    .catch(next);
});

usersRouter.get('/by-username/:username/profile', (req, res, next) => {
  getUserProfileByUsername(req.params.username)
    .then((profile) => res.json(profile))
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
