import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { AVATAR_STORED_MAX_DIMENSION, UPLOAD_OFFSET_HEADER } from '@messenger/shared';
import sharp from 'sharp';
import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdStoredNames: string[] = [];

async function registerUser(suffix: string): Promise<{ token: string; userId: string }> {
  const res = await request
    .post('/api/auth/register')
    .send({ username: `ava_${RUN_ID}_${suffix}`, password: 'password123', displayName: 'Аватар' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

function sha256Of(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function raw(width: number, height: number, frames = 1): Buffer {
  const data = Buffer.alloc(width * height * frames * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = index % 251;
    data[index + 1] = 120;
    data[index + 2] = 40;
    data[index + 3] = 255;
  }
  return data;
}

async function uploadAvatar(token: string, body: Buffer, mimeType: string, name: string) {
  const sha256 = sha256Of(body);
  const init = await request
    .post('/api/files/upload')
    .set('Authorization', `Bearer ${token}`)
    .send({ sha256, size: body.length, mimeType, originalName: name, purpose: 'avatar' });
  expect(init.status).toBe(201);

  const sent = await request
    .patch(`/api/files/upload/${init.body.sessionId}`)
    .set('Authorization', `Bearer ${token}`)
    .set(UPLOAD_OFFSET_HEADER, '0')
    .set('Content-Type', 'application/octet-stream')
    .send(body);
  expect(sent.status).toBe(200);
  expect(sent.body.done).toBe(true);

  const stored = await prisma.file.findUniqueOrThrow({ where: { id: sent.body.file.id } });
  createdStoredNames.push(stored.storedName);
  return { sourceSha256: sha256, file: stored };
}

function storedBytes(storedName: string): Promise<Buffer> {
  return fs.readFile(path.join(env.storageDir, 'files', storedName));
}

describe('аватарки идут через конвейер обработки (R-30C)', () => {
  afterAll(async () => {
    await prisma.user.updateMany({ where: { id: { in: createdUserIds } }, data: { avatarFileId: null } });
    await prisma.file.deleteMany({ where: { storedName: { in: createdStoredNames } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    for (const storedName of createdStoredNames) {
      await fs.unlink(path.join(env.storageDir, 'files', storedName)).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('перекодирует, уменьшает до 512 и по-прежнему даёт поставить себе аватар', async () => {
    const { token } = await registerUser('resize');
    const source = await sharp(raw(1200, 900), { raw: { width: 1200, height: 900, channels: 4 } })
      .png()
      .toBuffer();

    const { sourceSha256, file } = await uploadAvatar(token, source, 'image/png', 'big.png');

    expect(file.sourceSha256).toBe(sourceSha256);
    expect(file.sha256).not.toBe(sourceSha256);

    const meta = await sharp(await storedBytes(file.storedName)).metadata();
    expect(meta.width).toBe(AVATAR_STORED_MAX_DIMENSION);
    expect(meta.height).toBe(384);

    const applied = await request
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileId: file.id, sha256: sourceSha256 });
    expect(applied.status).toBe(200);
    expect(applied.body.avatarUrl).toBe(`/api/files/${file.id}`);
  });

  it('доказательство владения сверяется с присланным хэшем, а не с сохранённым', async () => {
    const { token } = await registerUser('proof');
    const source = await sharp(raw(300, 300), { raw: { width: 300, height: 300, channels: 4 } })
      .png()
      .toBuffer();

    const { file } = await uploadAvatar(token, source, 'image/png', 'proof.png');

    const withStoredHash = await request
      .post('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileId: file.id, sha256: file.sha256 });
    expect(withStoredHash.status).toBe(404);
  });

  it('анимированная гифка остаётся анимированной', async () => {
    const { token } = await registerUser('gif');
    const source = await sharp(raw(80, 80, 4), { raw: { width: 80, height: 320, channels: 4, pageHeight: 80 } })
      .gif({ delay: [80, 80, 80, 80], loop: 2 })
      .toBuffer();

    const { file } = await uploadAvatar(token, source, 'image/gif', 'anim.gif');

    expect(file.mimeType).toBe('image/gif');
    const meta = await sharp(await storedBytes(file.storedName), { animated: true }).metadata();
    expect(meta.pages).toBe(4);
    expect(meta.delay).toEqual([80, 80, 80, 80]);
    expect(meta.loop).toBe(2);
  });

  it('второй загрузивший тот же файл получает ту же обработанную копию', async () => {
    const { token: first } = await registerUser('dedupA');
    const { token: second } = await registerUser('dedupB');
    const source = await sharp(raw(200, 200), { raw: { width: 200, height: 200, channels: 4 } })
      .png()
      .toBuffer();

    const initial = await uploadAvatar(first, source, 'image/png', 'shared.png');

    const again = await request
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${second}`)
      .send({
        sha256: initial.sourceSha256,
        size: source.length,
        mimeType: 'image/png',
        originalName: 'shared.png',
        purpose: 'avatar',
      });

    expect(again.status).toBe(200);
    expect(again.body.status).toBe('exists');
    expect(again.body.file.id).toBe(initial.file.id);
  });

  it('картинка в сообщение по-прежнему уходит байт в байт', async () => {
    const { token } = await registerUser('message');
    const source = await sharp(raw(700, 700), { raw: { width: 700, height: 700, channels: 4 } })
      .png()
      .toBuffer();
    const sha256 = sha256Of(source);

    const init = await request
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ sha256, size: source.length, mimeType: 'image/png', originalName: 'shot.png', purpose: 'message' });
    const sent = await request
      .patch(`/api/files/upload/${init.body.sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .set(UPLOAD_OFFSET_HEADER, '0')
      .set('Content-Type', 'application/octet-stream')
      .send(source);

    const stored = await prisma.file.findUniqueOrThrow({ where: { id: sent.body.file.id } });
    createdStoredNames.push(stored.storedName);

    expect(stored.sha256).toBe(sha256);
    expect(stored.sourceSha256).toBe(sha256);
    expect(Number(stored.size)).toBe(source.length);
  });
});
