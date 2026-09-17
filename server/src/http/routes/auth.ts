import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  type AuthResponse,
} from '@messenger/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { forbidden, unauthorized } from '../../lib/errors.js';
import * as authService from '../../services/auth.js';
import {
  clearSessionCookies,
  isCsrfTokenValid,
  issueCsrfToken,
  readCsrfCookie,
  readRefreshToken,
  setSessionCookies,
} from '../authCookies.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';

export const authRouter: Router = Router();

function requireCsrfToken(req: Request, _res: Response, next: NextFunction): void {
  if (isCsrfTokenValid(req)) {
    next();
    return;
  }
  next(forbidden('Проверка запроса не пройдена, попробуйте ещё раз'));
}

function clientContext(req: Request): authService.ClientContext {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

function respondWithSession(
  res: Response,
  tokens: authService.SessionTokens,
  status: number,
  keepCsrfToken?: string,
): void {
  const csrfToken = keepCsrfToken ?? issueCsrfToken();
  setSessionCookies(res, tokens.refreshToken, csrfToken);
  const body: AuthResponse = { accessToken: tokens.accessToken, user: tokens.user, csrfToken };
  res.status(status).json(body);
}

authRouter.post('/register', authLimiter, validateBody(registerSchema), (req, res, next) => {
  authService
    .register(req.body, clientContext(req))
    .then((tokens) => respondWithSession(res, tokens, 201))
    .catch(next);
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), (req, res, next) => {
  const { username, password } = req.body;
  authService
    .login(username, password, clientContext(req))
    .then((tokens) => respondWithSession(res, tokens, 200))
    .catch(next);
});

authRouter.post('/refresh', validateBody(refreshSchema), requireCsrfToken, (req, res, next) => {
  const token = readRefreshToken(req);
  if (!token) {
    next(unauthorized('Нет активной сессии'));
    return;
  }

  authService
    .refresh(token, clientContext(req))
    .then((tokens) => respondWithSession(res, tokens, 200, readCsrfCookie(req)))
    .catch(next);
});

authRouter.post(
  '/password',
  authLimiter,
  requireAuth,
  validateBody(changePasswordSchema),
  (req, res, next) => {
    const currentRefreshToken = readRefreshToken(req);
    authService
      .changePassword(req.userId!, req.body.currentPassword, req.body.newPassword, currentRefreshToken)
      .then(({ terminatedSessions }) => res.status(200).json({ terminatedSessions }))
      .catch(next);
  },
);

authRouter.post('/logout', validateBody(refreshSchema), requireCsrfToken, (req, res, next) => {
  const token = readRefreshToken(req);
  clearSessionCookies(res);

  if (!token) {
    res.status(204).end();
    return;
  }

  authService
    .logout(token)
    .then(() => res.status(204).end())
    .catch(next);
});
