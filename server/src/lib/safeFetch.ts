import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { LookupFunction } from 'node:net';

export type SafeFetchFailure =
  | 'bad-url'
  | 'blocked-address'
  | 'too-many-redirects'
  | 'bad-status'
  | 'unsupported-type'
  | 'too-large'
  | 'timeout'
  | 'network';

export class SafeFetchError extends Error {
  readonly reason: SafeFetchFailure;

  constructor(reason: SafeFetchFailure, message: string) {
    super(message);
    this.name = 'SafeFetchError';
    this.reason = reason;
  }
}

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
  userAgent: string;
  accept: string;
  acceptContentType: (contentType: string | null) => boolean;
  isAddressAllowed?: (address: string) => boolean;
}

export interface SafeFetchResult {
  url: string;
  contentType: string | null;
  body: Buffer;
}

function ipv4Blocked(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function expandIpv6(address: string): number[] | null {
  const [head, tail] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? headGroups
      : [...headGroups, ...Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0'), ...tailGroups];

  if (groups.length !== 8) return null;

  const values: number[] = [];
  for (const group of groups) {
    const value = Number.parseInt(group === '' ? '0' : group, 16);
    if (Number.isNaN(value) || value < 0 || value > 0xffff) return null;
    values.push(value);
  }
  return values;
}

function ipv6Blocked(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? '';

  const mapped = /^(?:::ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(normalized);
  if (mapped?.[1]) return ipv4Blocked(mapped[1]);

  const groups = expandIpv6(normalized);
  if (!groups) return true;

  const [first = 0] = groups;
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  if (first === 0x64 && groups[1] === 0xff9b) return true;
  if (first === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff) {
    const embedded = `${(groups[6] ?? 0) >> 8}.${(groups[6] ?? 0) & 0xff}.${(groups[7] ?? 0) >> 8}.${(groups[7] ?? 0) & 0xff}`;
    return ipv4Blocked(embedded);
  }
  return false;
}

export function isPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) return !ipv4Blocked(address);
  if (net.isIPv6(address)) return !ipv6Blocked(address);
  return false;
}

function parseTarget(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError('bad-url', `Адрес не разбирается: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('bad-url', `Схема ${url.protocol} не разрешена`);
  }
  return url;
}

async function resolveAllowedAddress(hostname: string, isAllowed: (address: string) => boolean): Promise<string> {
  const literal = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

  if (net.isIP(literal)) {
    if (!isAllowed(literal)) throw new SafeFetchError('blocked-address', `Адрес ${literal} внутренний`);
    return literal;
  }

  let records: { address: string }[];
  try {
    records = await dns.lookup(literal, { all: true, verbatim: true });
  } catch {
    throw new SafeFetchError('network', `Имя ${literal} не резолвится`);
  }

  if (records.length === 0) throw new SafeFetchError('network', `Имя ${literal} не резолвится`);
  for (const record of records) {
    if (!isAllowed(record.address)) {
      throw new SafeFetchError('blocked-address', `Имя ${literal} ведёт на внутренний адрес ${record.address}`);
    }
  }
  return records[0]!.address;
}

interface SingleResponse {
  statusCode: number;
  location: string | null;
  contentType: string | null;
  body: Buffer | null;
}

function requestOnce(url: URL, address: string, options: SafeFetchOptions, signal: AbortSignal): Promise<SingleResponse> {
  const transport = url.protocol === 'https:' ? https : http;

  const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    const family = net.isIPv6(address) ? 6 : 4;
    if (typeof lookupOptions === 'object' && lookupOptions?.all) {
      (callback as unknown as (err: null, addresses: { address: string; family: number }[]) => void)(null, [
        { address, family },
      ]);
      return;
    }
    callback(null, address, family);
  };

  return new Promise<SingleResponse>((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: 'GET',
        lookup,
        signal,
        headers: {
          'user-agent': options.userAgent,
          accept: options.accept,
          'accept-encoding': 'identity',
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location ?? null;
        const contentType = response.headers['content-type'] ?? null;

        if (statusCode >= 300 && statusCode < 400 && location) {
          response.destroy();
          resolve({ statusCode, location, contentType, body: null });
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.destroy();
          reject(new SafeFetchError('bad-status', `Ответ ${statusCode}`));
          return;
        }

        if (!options.acceptContentType(contentType)) {
          response.destroy();
          reject(new SafeFetchError('unsupported-type', `Тип ответа ${contentType ?? 'неизвестен'} не подходит`));
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;

        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > options.maxBytes) {
            response.destroy();
            request.destroy();
            reject(new SafeFetchError('too-large', `Ответ больше ${options.maxBytes} байт`));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ statusCode, location: null, contentType, body: Buffer.concat(chunks) }));
        response.on('error', (error) => reject(toFetchError(error)));
      },
    );

    request.on('error', (error) => reject(toFetchError(error)));
    request.end();
  });
}

function toFetchError(error: unknown): SafeFetchError {
  if (error instanceof SafeFetchError) return error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError') return new SafeFetchError('timeout', 'Истекло время ожидания');
  return new SafeFetchError('network', error instanceof Error ? error.message : 'Сетевая ошибка');
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const isAllowed = options.isAddressAllowed ?? isPublicAddress;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    let url = parseTarget(rawUrl);

    for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
      const address = await resolveAllowedAddress(url.hostname, isAllowed);
      const response = await requestOnce(url, address, options, controller.signal);

      if (response.body) {
        return { url: url.toString(), contentType: response.contentType, body: response.body };
      }

      let next: URL;
      try {
        next = new URL(response.location ?? '', url);
      } catch {
        throw new SafeFetchError('bad-url', 'Редирект ведёт на неразбираемый адрес');
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new SafeFetchError('bad-url', `Редирект на схему ${next.protocol}`);
      }
      url = next;
    }

    throw new SafeFetchError('too-many-redirects', `Больше ${options.maxRedirects} редиректов`);
  } catch (error) {
    throw toFetchError(error);
  } finally {
    clearTimeout(timer);
  }
}
