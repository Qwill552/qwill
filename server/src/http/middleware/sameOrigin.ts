import type { NextFunction, Request, Response } from 'express';

import { env, isAllowedClientOrigin } from '../../config/env.js';
import { forbidden } from '../../lib/errors.js';
import { hasSessionCookie } from '../authCookies.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'none']);

function isAllowedRequestOrigin(origin: string): boolean {
  return origin === env.APP_ORIGIN || isAllowedClientOrigin(origin);
}

export function isTrustedRequestSource(req: Request): boolean {
  const origin = req.get('origin');
  if (origin !== undefined) return isAllowedRequestOrigin(origin);

  const fetchSite = req.get('sec-fetch-site');
  return fetchSite === undefined || TRUSTED_FETCH_SITES.has(fetchSite);
}

export function sameOriginGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method) || !hasSessionCookie(req) || isTrustedRequestSource(req)) {
    next();
    return;
  }
  next(forbidden('Запрос пришёл с постороннего адреса'));
}
