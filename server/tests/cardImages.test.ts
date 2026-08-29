import {
  CARD_IMAGE_MAX_COUNT,
  CARD_IMAGE_TOTAL_MAX_BYTES,
  toSafeCardImageName,
} from '@messenger/shared';
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

async function registerUser(suffix: string): Promise<{ token: string; userId: string }> {
  const res = await request
    .post('/api/auth/register')
    .send({ username: `img_${RUN_ID}_${suffix}`, password: 'password123', displayName: 'Картинки' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

function makePng(width = 24, height = 24): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4, 0x80);
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

function upload(token: string, name: string, body: Buffer, replace = false): supertest.Test {
  const query = `name=${encodeURIComponent(name)}${replace ? '&replace=1' : ''}`;
  return request
    .post(`/api/users/me/card/images?${query}`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'image/png')
    .send(body);
}

describe('картинки визитки (R-30C)', () => {
  afterAll(async () => {
    await prisma.profileCardImage.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('загружает, показывает списком и отдаёт с домена песочницы', async () => {
    const { token, userId } = await registerUser('basic');

    const created = await upload(token, 'cat.png', await makePng());
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('cat.png');
    expect(created.body.width).toBe(24);
    expect(created.body.url).toContain(`${env.CARD_ORIGIN}/c/${userId}/img/cat.png`);

    const list = await request.get('/api/users/me/card/images').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.images).toHaveLength(1);
    expect(list.body.maxCount).toBe(CARD_IMAGE_MAX_COUNT);

    const served = await request.get(`/c/${userId}/img/cat.png`).set('Host', env.cardHost);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-security-policy']).toContain('sandbox');
  });

  it('картинка соседа недоступна ни по его пути, ни обходом каталога', async () => {
    const { token: mine } = await registerUser('ownerA');
    const { token: theirs, userId: theirId } = await registerUser('ownerB');

    await upload(theirs, 'secret.png', await makePng());

    const { userId: myId } = await registerUser('ownerC');
    const foreign = await request.get(`/c/${myId}/img/secret.png`).set('Host', env.cardHost);
    expect(foreign.status).toBe(404);

    const traversal = await request.get(`/c/${myId}/img/..%2F..%2F${theirId}%2Fimg%2Fsecret.png`).set('Host', env.cardHost);
    expect(traversal.status).toBe(404);

    const mineList = await request.get('/api/users/me/card/images').set('Authorization', `Bearer ${mine}`);
    expect(mineList.body.images).toHaveLength(0);
  });

  it('имя приводится к расширению настоящего формата, а негодное отклоняется', async () => {
    const { token } = await registerUser('names');

    const jpeg = await sharp(Buffer.alloc(16 * 16 * 4, 0x40), { raw: { width: 16, height: 16, channels: 4 } })
      .jpeg()
      .toBuffer();
    const created = await upload(token, 'photo.png', jpeg);
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('photo.jpg');

    const slash = await upload(token, 'dir/cat.png', await makePng());
    expect(slash.status).toBe(400);

    const dots = await upload(token, '..png', await makePng());
    expect(dots.status).toBe(400);

    const noExtension = await upload(token, 'cat', await makePng());
    expect(noExtension.status).toBe(400);
  });

  it('совпадение имени — отказ, пока явно не сказано «заменить»', async () => {
    const { token } = await registerUser('replace');
    await upload(token, 'one.png', await makePng(24, 24));

    const clash = await upload(token, 'one.png', await makePng(40, 40));
    expect(clash.status).toBe(409);

    const replaced = await upload(token, 'one.png', await makePng(40, 40), true);
    expect(replaced.status).toBe(201);
    expect(replaced.body.width).toBe(40);

    const list = await request.get('/api/users/me/card/images').set('Authorization', `Bearer ${token}`);
    expect(list.body.images).toHaveLength(1);
  });

  it('квота по числу файлов отвечает текущими цифрами', async () => {
    const { token, userId } = await registerUser('countquota');
    await prisma.profileCardImage.createMany({
      data: Array.from({ length: CARD_IMAGE_MAX_COUNT }, (_unused, index) => ({
        userId,
        name: `filler${index}.png`,
        storageId: `filler${index}.png`,
        mime: 'image/png',
        width: 8,
        height: 8,
        bytes: 100,
      })),
    });

    const res = await upload(token, 'extra.png', await makePng());

    expect(res.status).toBe(413);
    expect(res.body.error.message).toContain(String(CARD_IMAGE_MAX_COUNT));
  });

  it('квота по объёму отвечает текущими цифрами', async () => {
    const { token, userId } = await registerUser('bytesquota');
    await prisma.profileCardImage.create({
      data: {
        userId,
        name: 'huge.png',
        storageId: 'huge.png',
        mime: 'image/png',
        width: 8,
        height: 8,
        bytes: CARD_IMAGE_TOTAL_MAX_BYTES,
      },
    });

    const res = await upload(token, 'extra.png', await makePng());

    expect(res.status).toBe(413);
    expect(res.body.error.message).toContain('20');
  });

  it('удаление убирает картинку из списка и с домена песочницы', async () => {
    const { token, userId } = await registerUser('delete');
    await upload(token, 'gone.png', await makePng());

    const removed = await request
      .delete('/api/users/me/card/images/gone.png')
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(204);

    const list = await request.get('/api/users/me/card/images').set('Authorization', `Bearer ${token}`);
    expect(list.body.images).toHaveLength(0);

    const served = await request.get(`/c/${userId}/img/gone.png`).set('Host', env.cardHost);
    expect(served.status).toBe(404);
  });

  it('без входа картинки не загружаются и не удаляются', async () => {
    const anonymous = await request
      .post('/api/users/me/card/images?name=cat.png')
      .set('Content-Type', 'image/png')
      .send(await makePng());
    expect(anonymous.status).toBe(401);
  });

  it('безопасное имя из имени файла отбрасывает пути и кириллицу', () => {
    expect(toSafeCardImageName('C:\\Мои файлы\\Кот 1.PNG')).toBe('c-1.png');
    expect(toSafeCardImageName('..\\..\\etc\\passwd')).toBe('image.png');
    expect(toSafeCardImageName('фото.jpeg')).toBe('image.jpeg');
  });
});
