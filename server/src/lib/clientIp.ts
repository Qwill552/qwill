import type { IncomingHttpHeaders } from 'node:http';
import type { Request } from 'express';

export interface HandshakeLike {
  headers: IncomingHttpHeaders;
  address: string;
}

export function ipFromRequest(req: Request): string {
  return req.ip ?? '';
}

export function ipFromHandshake(handshake: HandshakeLike): string {
  const header = handshake.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header[header.length - 1] : header;
  const parts = (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : handshake.address;
}
