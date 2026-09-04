import type * as dnsPromises from 'node:dns/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dnsStub = vi.hoisted(() => ({
  lookup: null as null | ((hostname: string) => { address: string; family: number }[]),
}));

vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof dnsPromises>();
  const lookup = (hostname: string, options: unknown): unknown =>
    dnsStub.lookup
      ? Promise.resolve(dnsStub.lookup(hostname))
      : (actual.default.lookup as unknown as (h: string, o: unknown) => unknown)(hostname, options);

  return { ...actual, default: { ...actual.default, lookup } };
});

const { isPublicAddress, safeFetch, SafeFetchError } = await import('../src/lib/safeFetch.js');

const BASE_OPTIONS = {
  maxBytes: 64 * 1024,
  timeoutMs: 5_000,
  maxRedirects: 3,
  userAgent: 'QwillTest/1.0',
  accept: 'text/html',
  acceptContentType: (contentType: string | null) => (contentType ?? '').includes('text/html'),
};

const allowLoopback = (address: string): boolean => address === '127.0.0.1' || isPublicAddress(address);

let server: http.Server;
let origin: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '/';

    if (url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><head><title>Страница</title></head><body>тело</body></html>');
      return;
    }
    if (url === '/redirect-once') {
      res.writeHead(302, { location: '/page' });
      res.end();
      return;
    }
    if (url === '/redirect-internal') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
      res.end();
      return;
    }
    if (url.startsWith('/chain/')) {
      const step = Number.parseInt(url.slice('/chain/'.length), 10);
      res.writeHead(302, { location: `/chain/${step + 1}` });
      res.end();
      return;
    }
    if (url === '/huge') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(Buffer.alloc(256 * 1024, 0x61));
      return;
    }
    if (url === '/pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(Buffer.from('%PDF-1.4'));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('нет');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  dnsStub.lookup = null;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SafeFetchError) return error.reason;
    throw error;
  }
  return 'нет ошибки';
}

describe('isPublicAddress (PM-8)', () => {
  it('отвергает внутренние адреса', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '169.254.169.254',
      '0.0.0.0',
      '100.64.0.1',
      '224.0.0.1',
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:192.168.1.1',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('пропускает публичные', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });
});

describe('safeFetch — защита (PM-8)', () => {
  it('отвергает не-HTTP схемы', async () => {
    expect(await reasonOf(safeFetch('ftp://example.com/x', BASE_OPTIONS))).toBe('bad-url');
    expect(await reasonOf(safeFetch('file:///etc/passwd', BASE_OPTIONS))).toBe('bad-url');
    expect(await reasonOf(safeFetch('не адрес', BASE_OPTIONS))).toBe('bad-url');
  });

  it('отвергает внутренние адреса напрямую', async () => {
    expect(await reasonOf(safeFetch('http://127.0.0.1:3000/health', BASE_OPTIONS))).toBe('blocked-address');
    expect(await reasonOf(safeFetch('http://192.168.0.1/', BASE_OPTIONS))).toBe('blocked-address');
    expect(await reasonOf(safeFetch('http://[::1]/', BASE_OPTIONS))).toBe('blocked-address');
    expect(await reasonOf(safeFetch('http://169.254.169.254/latest/meta-data', BASE_OPTIONS))).toBe('blocked-address');
  });

  it('отвергает имя, резолвящееся во внутренний адрес', async () => {
    dnsStub.lookup = () => [{ address: '10.0.0.5', family: 4 }];
    expect(await reasonOf(safeFetch('http://inside.example.com/', BASE_OPTIONS))).toBe('blocked-address');

    dnsStub.lookup = () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ];
    expect(await reasonOf(safeFetch('http://mixed.example.com/', BASE_OPTIONS))).toBe('blocked-address');
    dnsStub.lookup = null;
  });

  it('проверяет адрес на каждом прыжке редиректа', async () => {
    const reason = await reasonOf(
      safeFetch(`${origin}/redirect-internal`, { ...BASE_OPTIONS, isAddressAllowed: allowLoopback }),
    );
    expect(reason).toBe('blocked-address');
  });

  it('обрывает цепочку из четырёх редиректов', async () => {
    const reason = await reasonOf(safeFetch(`${origin}/chain/1`, { ...BASE_OPTIONS, isAddressAllowed: allowLoopback }));
    expect(reason).toBe('too-many-redirects');
  });

  it('идёт по одному редиректу и возвращает конечный адрес', async () => {
    const result = await safeFetch(`${origin}/redirect-once`, { ...BASE_OPTIONS, isAddressAllowed: allowLoopback });
    expect(result.url).toBe(`${origin}/page`);
    expect(result.body.toString('utf8')).toContain('Страница');
  });

  it('обрывает ответ больше потолка', async () => {
    const reason = await reasonOf(
      safeFetch(`${origin}/huge`, { ...BASE_OPTIONS, maxBytes: 4096, isAddressAllowed: allowLoopback }),
    );
    expect(reason).toBe('too-large');
  });

  it('не разбирает ответ с чужим Content-Type', async () => {
    const reason = await reasonOf(safeFetch(`${origin}/pdf`, { ...BASE_OPTIONS, isAddressAllowed: allowLoopback }));
    expect(reason).toBe('unsupported-type');
  });

  it('отвергает ответ с ошибкой', async () => {
    const reason = await reasonOf(safeFetch(`${origin}/missing`, { ...BASE_OPTIONS, isAddressAllowed: allowLoopback }));
    expect(reason).toBe('bad-status');
  });
});
