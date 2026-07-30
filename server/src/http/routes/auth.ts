import { loginSchema, refreshSchema, registerSchema, type AuthResponse } from '@messenger/shared';
import { Router, type Request, type Response } from 'express';

import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/errors.js';
import * as authService from '../../services/auth.js';
import { validateBody } from '../middleware/validate.js';

export const authRouter: Router = Router();

/** Кука — путь в браузере; Capacitor шлёт refreshToken в теле, т.к. кука там сторонняя (секция 6). */
const REFRESH_COOKIE = 'messenger_refresh_token';

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions);
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
}

function readRefreshToken(req: Request): string | undefined {
  const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  return fromCookie ?? fromBody;
}

function toAuthResponse(tokens: authService.SessionTokens): AuthResponse {
  return { accessToken: tokens.accessToken, user: tokens.user };
}

authRouter.post('/register', validateBody(registerSchema), (req, res, next) => {
  authService
    .register(req.body, req.headers['user-agent'])
    .then((tokens) => {
      setRefreshCookie(res, tokens.refreshToken);
      res.status(201).json(toAuthResponse(tokens));
    })
    .catch(next);
});

authRouter.post('/login', validateBody(loginSchema), (req, res, next) => {
  const { username, password } = req.body;
  authService
    .login(username, password, req.headers['user-agent'])
    .then((tokens) => {
      setRefreshCookie(res, tokens.refreshToken);
      res.json(toAuthResponse(tokens));
    })
    .catch(next);
});

authRouter.post('/refresh', validateBody(refreshSchema), (req, res, next) => {
  const token = readRefreshToken(req);
  if (!token) {
    next(unauthorized('Нет активной сессии'));
    return;
  }

  authService
    .refresh(token, req.headers['user-agent'])
    .then((tokens) => {
      setRefreshCookie(res, tokens.refreshToken);
      res.json(toAuthResponse(tokens));
    })
    .catch(next);
});

authRouter.post('/logout', validateBody(refreshSchema), (req, res, next) => {
  const token = readRefreshToken(req);
  clearRefreshCookie(res);

  if (!token) {
    res.status(204).end();
    return;
  }

  authService
    .logout(token)
    .then(() => res.status(204).end())
    .catch(next);
});
