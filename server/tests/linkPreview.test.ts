import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import type { LinkPreviewDto } from '@messenger/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import { assertFileAccess } from '../src/services/file.js';
import { getLinkPreviews, normalizeLinkUrl, parseOpenGraph } from '../src/services/linkPreview.js';

const RUN_ID = Date.now().toString(36);
const createdUrls: string[] = [];

const hits = new Map<string, number>();
let server: http.Server;
let origin: string;

function countHit(url: string): void {
  hits.set(url, (hits.get(url) ?? 0) + 1);
}

async function makePng(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 32, channels: 3, background: { r: 90, g: 40, b: 200 } } })
    .png()
    .toBuffer();
}

let png: Buffer;

beforeAll(async () => {
  png = await makePng();

  server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0] ?? '/';
    countHit(url);

    if (url === '/good') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head>
          <meta property="og:site_name" content="Пример сайта">
          <meta property="og:title" content="Заголовок из OG">
          <meta property="og:description" content="Описание из OG">
          <meta property="og:image" content="/cover.png">
          <title>Заголовок из title</title>
        </head><body>тело</body></html>`,
      );
      return;
    }
    if (url === '/no-image') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><head><title>Только заголовок</title></head><body></body></html>');
      return;
    }
    if (url === '/cover.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png);
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
  const records = await prisma.linkPreview.findMany({ where: { url: { in: createdUrls } } });
  const fileIds = records.map((record) => record.imageFileId).filter((id): id is string => id !== null);

  await prisma.linkPreview.deleteMany({ where: { url: { in: createdUrls } } });

  const files = await prisma.file.findMany({ where: { id: { in: fileIds } } });
  await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
  for (const file of files) {
    await fs.unlink(path.join(env.storageDir, 'files', file.storedName)).catch(() => undefined);
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function pageUrl(pathname: string, tag: string): string {
  const url = `${origin}${pathname}?run=${RUN_ID}_${tag}`;
  createdUrls.push(url);
  return url;
}

function fetchOnce(url: string): Promise<LinkPreviewDto> {
  return getLinkPreviews([url], { isAddressAllowed: () => true, awaitFetch: true }).then((previews) => previews[0]!);
}

describe('normalizeLinkUrl (PM-8)', () => {
  it('сводит схему, хост, порт и якорь к одному ключу', () => {
    expect(normalizeLinkUrl('HTTP://Example.COM:80/a#b')).toBe('http://example.com/a');
    expect(normalizeLinkUrl('https://Example.com:443/a')).toBe('https://example.com/a');
  });

  it('оставляет параметры запроса', () => {
    expect(normalizeLinkUrl('http://example.com/a?ref=1')).toBe('http://example.com/a?ref=1');
    expect(normalizeLinkUrl('http://example.com/a?ref=1')).not.toBe(normalizeLinkUrl('http://example.com/a'));
  });

  it('отвергает чужие схемы и мусор', () => {
    expect(normalizeLinkUrl('ftp://example.com/a')).toBeNull();
    expect(normalizeLinkUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeLinkUrl('просто текст')).toBeNull();
    expect(normalizeLinkUrl(`http://example.com/${'a'.repeat(3000)}`)).toBeNull();
  });
});

describe('parseOpenGraph (PM-8)', () => {
  it('предпочитает og:* тегам страницы', () => {
    const parsed = parseOpenGraph(
      `<html><head>
        <meta property="og:title" content="Из OG">
        <meta property="og:description" content="Описание OG">
        <meta name="description" content="Описание meta">
        <title>Из title</title>
      </head><body></body></html>`,
      'https://example.com/a',
    );
    expect(parsed.title).toBe('Из OG');
    expect(parsed.description).toBe('Описание OG');
  });

  it('падает на теги страницы, когда og:* нет', () => {
    const parsed = parseOpenGraph(
      '<html><head><title>Из title</title><meta name="description" content="Из meta"></head></html>',
      'https://www.example.com/a',
    );
    expect(parsed.title).toBe('Из title');
    expect(parsed.description).toBe('Из meta');
    expect(parsed.siteName).toBe('example.com');
  });

  it('разрешает относительный og:image от конечного адреса', () => {
    const parsed = parseOpenGraph(
      '<html><head><meta property="og:image" content="../img/cover.png"></head></html>',
      'https://example.com/news/2026/story',
    );
    expect(parsed.imageUrl).toBe('https://example.com/news/img/cover.png');
  });

  it('отбрасывает og:image с чужой схемой', () => {
    const parsed = parseOpenGraph(
      '<html><head><meta property="og:image" content="javascript:alert(1)"></head></html>',
      'https://example.com/a',
    );
    expect(parsed.imageUrl).toBeNull();
  });

  it('обрезает по длине и вычищает HTML', () => {
    const parsed = parseOpenGraph(
      `<html><head>
        <meta property="og:title" content="${'я'.repeat(300)}">
        <meta property="og:description" content="${'ю'.repeat(400)}">
      </head></html>`,
      'https://example.com/a',
    );
    expect(parsed.title?.length).toBe(120);
    expect(parsed.description?.length).toBe(200);

    const withHtml = parseOpenGraph(
      '<html><head><title>&lt;b&gt;жирный&lt;/b&gt; заголовок</title></head></html>',
      'https://example.com/a',
    );
    expect(withHtml.title).toBe('жирный заголовок');
  });
});

describe('getLinkPreviews (PM-8)', () => {
  it('добывает превью и кладёт картинку к нам', async () => {
    const url = pageUrl('/good', 'ready');
    const preview = await fetchOnce(url);

    expect(preview.status).toBe('ready');
    expect(preview.title).toBe('Заголовок из OG');
    expect(preview.siteName).toBe('Пример сайта');
    expect(preview.description).toBe('Описание из OG');
    expect(preview.imageUrl).toMatch(/^\/api\/files\/[\w-]+$/u);

    const fileId = preview.imageUrl!.split('/').pop()!;
    const file = await prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    expect(file.mimeType).toBe('image/png');
    await expect(assertFileAccess(fileId, 'любой-вошедший')).resolves.toBeUndefined();
  });

  it('повторный запрос отдаётся из кэша и наружу не ходит', async () => {
    const url = pageUrl('/no-image', 'cache');
    const first = await fetchOnce(url);
    expect(first.status).toBe('ready');
    expect(first.title).toBe('Только заголовок');
    expect(first.imageUrl).toBeNull();

    const before = hits.get('/no-image') ?? 0;
    const second = await fetchOnce(url);
    expect(second.status).toBe('ready');
    expect(hits.get('/no-image') ?? 0).toBe(before);
  });

  it('кэширует и неудачу', async () => {
    const url = pageUrl('/missing', 'failed');
    const first = await fetchOnce(url);
    expect(first.status).toBe('failed');

    const before = hits.get('/missing') ?? 0;
    const second = await fetchOnce(url);
    expect(second.status).toBe('failed');
    expect(hits.get('/missing') ?? 0).toBe(before);

    const record = await prisma.linkPreview.findUniqueOrThrow({ where: { url } });
    expect(record.attempts).toBe(1);
    expect(record.expiresAt).not.toBeNull();
  });

  it('не разбирает как страницу чужой тип ответа', async () => {
    const preview = await fetchOnce(pageUrl('/pdf', 'pdf'));
    expect(preview.status).toBe('failed');
  });

  it('перетягивает просроченную запись', async () => {
    const url = pageUrl('/no-image', 'expired');
    await fetchOnce(url);

    await prisma.linkPreview.update({ where: { url }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const before = hits.get('/no-image') ?? 0;

    const preview = await fetchOnce(url);
    expect(preview.status).toBe('ready');
    expect(hits.get('/no-image') ?? 0).toBe(before + 1);
  });

  it('отвергает адрес, который вообще не ссылка', async () => {
    const previews = await getLinkPreviews(['просто текст'], { isAddressAllowed: () => true, awaitFetch: true });
    expect(previews[0]!.status).toBe('failed');
    expect(previews[0]!.url).toBe('просто текст');
  });
});
