import { createHash, randomBytes } from 'node:crypto';

import type { UserRole } from '@messenger/shared';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string;
}

/** Access — JWT на 15 минут, живёт только в памяти вкладки (секция 3). */
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new Error('Некорректный payload токена');
  }
  return { sub: payload.sub };
}

/** Refresh — случайная строка; в БД хранится только её хэш (секция 3). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 достаточно: сам токен уже высокоэнтропийный, медленный хэш не нужен. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(): Date {
  const days = env.REFRESH_TOKEN_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function sessionExpiryForRole(role: UserRole): Date {
  if (role !== 'admin') return refreshTokenExpiry();
  return new Date(Date.now() + env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000);
}

export interface AdminTicketPayload {
  sub: string;
  purpose: 'admin';
}

export interface AdminTicket {
  ticket: string;
  expiresAt: Date;
}

export function signAdminTicket(userId: string): AdminTicket {
  const minutes = env.ADMIN_TICKET_TTL_MINUTES;
  const ticket = jwt.sign({ sub: userId, purpose: 'admin' } satisfies AdminTicketPayload, env.JWT_SECRET, {
    expiresIn: `${minutes}m`,
  });
  return { ticket, expiresAt: new Date(Date.now() + minutes * 60 * 1000) };
}

export function verifyAdminTicket(token: string): AdminTicketPayload {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (typeof payload === 'string' || typeof payload.sub !== 'string' || payload.purpose !== 'admin') {
    throw new Error('Некорректный админский билет');
  }
  return { sub: payload.sub, purpose: 'admin' };
}

export interface FileTokenPayload {
  sub: string;
  fid: string;
}

/**
 * `<img>`/`<video>` не умеют слать Authorization-заголовок, а межсайтовые куки ненадёжны
 * (и вовсе отсутствуют у будущего Capacitor-клиента, секция 6) — поэтому доступ к файлу
 * по прямой ссылке идёт через короткоживущий подписанный токен в query, а не Bearer.
 */
export function signFileToken(userId: string, fileId: string): string {
  return jwt.sign({ sub: userId, fid: fileId } satisfies FileTokenPayload, env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

export function verifyFileToken(token: string): FileTokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.fid !== 'string') {
    throw new Error('Некорректный файловый токен');
  }
  return { sub: payload.sub, fid: payload.fid };
}
