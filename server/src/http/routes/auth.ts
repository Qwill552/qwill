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
  wantsBodySession,
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
  req: Request,
  res: Response,
  tokens: authService.SessionTokens,
  status: number,
  keepCsrfToken?: string,
): void {
  const { accessToken, user, refreshToken } = tokens;
  if (wantsBodySession(req)) {
    const body: AuthResponse = { accessToken, user, csrfToken: issueCsrfToken(), refreshToken };
    res.status(status).json(body);
    return;
  }
  const csrfToken = keepCsrfToken ?? issueCsrfToken();
  setSessionCookies(res, refreshToken, csrfToken);
  const body: AuthResponse = { accessToken, user, csrfToken };
  res.status(status).json(body);
}

authRouter.post('/register', authLimiter, validateBody(registerSchema), (req, res, next) => {
  authService
    .register(req.body, clientContext(req))
    .then((tokens) => respondWithSession(req, res, tokens, 201))
    .catch(next);
});

authRouter.post('/login', authLimiter, validateBody(loginSchema), (req, res, next) => {
  const { username, password } = req.body;
  authService
    .login(username, password, clientContext(req))
    .then((tokens) => respondWithSession(req, res, tokens, 200))
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
    .then((tokens) => respondWithSession(req, res, tokens, 200, readCsrfCookie(req)))
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
  if (!wantsBodySession(req)) clearSessionCookies(res);

  if (!token) {
    res.status(204).end();
    return;
  }

  authService
    .logout(token)
    .then(() => res.status(204).end())
    .catch(next);
});
