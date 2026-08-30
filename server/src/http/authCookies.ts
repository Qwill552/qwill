import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { Request, Response } from 'express';

import { env } from '../config/env.js';

export const REFRESH_COOKIE = '__Host-messenger_refresh_token';
export const CSRF_COOKIE = '__Host-messenger_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export const LEGACY_REFRESH_COOKIE = 'messenger_refresh_token';
const LEGACY_REFRESH_COOKIE_PATH = '/api/auth';

const hostCookieAttributes = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

const sessionCookieOptions = {
  ...hostCookieAttributes,
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

function cookiesOf(req: Request): Record<string, string> {
  return (req.cookies as Record<string, string> | undefined) ?? {};
}

export function issueCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function setSessionCookies(res: Response, refreshToken: string, csrfToken: string): void {
  res.cookie(REFRESH_COOKIE, refreshToken, sessionCookieOptions);
  res.cookie(CSRF_COOKIE, csrfToken, sessionCookieOptions);
  res.clearCookie(LEGACY_REFRESH_COOKIE, { path: LEGACY_REFRESH_COOKIE_PATH });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, hostCookieAttributes);
  res.clearCookie(CSRF_COOKIE, hostCookieAttributes);
  res.clearCookie(LEGACY_REFRESH_COOKIE, { path: LEGACY_REFRESH_COOKIE_PATH });
}

export function readRefreshToken(req: Request): string | undefined {
  const cookies = cookiesOf(req);
  const fromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  return cookies[REFRESH_COOKIE] ?? cookies[LEGACY_REFRESH_COOKIE] ?? fromBody;
}

export function hasSessionCookie(req: Request): boolean {
  const cookies = cookiesOf(req);
  return REFRESH_COOKIE in cookies || LEGACY_REFRESH_COOKIE in cookies;
}

function matchesCsrfToken(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string') return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length) return false;
  return timingSafeEqual(expectedBytes, providedBytes);
}

export function isCsrfTokenValid(req: Request): boolean {
  const cookies = cookiesOf(req);
  if (!(REFRESH_COOKIE in cookies)) return true;
  const expected = cookies[CSRF_COOKIE];
  if (!expected) return false;
  return matchesCsrfToken(expected, req.get(CSRF_HEADER));
}
