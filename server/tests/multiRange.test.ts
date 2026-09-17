import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { multiRangeStatic } from '../src/http/middleware/multiRange.js';

const BODY_SIZE = 4096;
let root = '';
let request: supertest.Agent;
const body = Buffer.alloc(BODY_SIZE);
for (let i = 0; i < BODY_SIZE; i += 1) body[i] = i % 251;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'qwill-range-'));
  await writeFile(path.join(root, 'Qwill-Setup-9.9.9.exe'), body);

  const app = express();
  app.use('/win', multiRangeStatic(root));
  app.use('/win', express.static(root, { acceptRanges: true }));
  request = supertest(app);
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

function boundaryOf(contentType: string): string {
  const match = /boundary=(?:"([^"]+)"|([^\s";]+))/i.exec(contentType);
  return (match?.[1] ?? match?.[2]) as string;
}

function partsOf(raw: Buffer, boundary: string): Buffer[] {
  const separator = Buffer.from(`\r\n--${boundary}`);
  const head = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let cursor = head.length;

  for (;;) {
    const headerEnd = raw.indexOf('\r\n\r\n', cursor);
    if (headerEnd === -1) break;
    const bodyStart = headerEnd + 4;
    const next = raw.indexOf(separator, bodyStart);
    if (next === -1) break;
    parts.push(raw.subarray(bodyStart, next));
    cursor = next + separator.length;
    if (raw.subarray(cursor, cursor + 2).toString() === '--') break;
  }
  return parts;
}

describe('многодиапазонная раздача выпусков', () => {
  it('один диапазон отдаётся обычным 206 — обработчик не вмешивается', async () => {
    const res = await request.get('/win/Qwill-Setup-9.9.9.exe').set('Range', 'bytes=0-99');

    expect(res.status).toBe(206);
    expect(res.headers['content-type']).not.toContain('multipart');
    expect(res.headers['content-range']).toBe(`bytes 0-99/${BODY_SIZE}`);
  });

  it('несколько диапазонов дают 206 multipart/byteranges, а не 200 с целым файлом', async () => {
    const res = await request
      .get('/win/Qwill-Setup-9.9.9.exe')
      .set('Range', 'bytes=0-99, 1000-1099, 4000-4095')
      .buffer()
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(206);
    expect(res.headers['content-type']).toMatch(/^multipart\/byteranges;\s*boundary=/);

    const raw = res.body as Buffer;
    expect(Number(res.headers['content-length'])).toBe(raw.length);

    const parts = partsOf(raw, boundaryOf(res.headers['content-type'] as string));
    expect(parts).toHaveLength(3);
    expect(parts[0].equals(body.subarray(0, 100))).toBe(true);
    expect(parts[1].equals(body.subarray(1000, 1100))).toBe(true);
    expect(parts[2].equals(body.subarray(4000, 4096))).toBe(true);
  });

  it('диапазон за концом файла — 416 с Content-Range', async () => {
    const res = await request
      .get('/win/Qwill-Setup-9.9.9.exe')
      .set('Range', `bytes=${BODY_SIZE + 10}-${BODY_SIZE + 20}, ${BODY_SIZE + 30}-`);

    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${BODY_SIZE}`);
  });

  it('выход за пределы каталога не обслуживается', async () => {
    const res = await request.get('/win/..%2F..%2Fsecret.txt').set('Range', 'bytes=0-9, 20-29');

    expect(res.status).not.toBe(206);
  });

  it('запрос без Range проходит мимо обработчика целиком', async () => {
    const res = await request.get('/win/Qwill-Setup-9.9.9.exe').buffer();

    expect(res.status).toBe(200);
    expect(Number(res.headers['content-length'])).toBe(BODY_SIZE);
  });
});
