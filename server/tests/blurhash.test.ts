import { isBlurhash } from '@messenger/shared';
import sharp from 'sharp';
import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { computeBlurhash } from '../src/lib/processImage.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { storeServerFile } from '../src/services/file.js';
import { sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];
const createdFileIds: string[] = [];

let seq = 0;

async function registerUser(suffix: string): Promise<{ userId: string; username: string }> {
  const username = `bh_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: suffix , termsVersion: '1.0', privacyVersion: '1.0' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username };
}

async function makeThumbnail(): Promise<{ id: string; sha256: string }> {
  seq += 1;
  const png = await sharp({
    create: { width: 48, height: 36, channels: 3, background: { r: 200, g: 40, b: seq } },
  })
    .png()
    .toBuffer();
  const file = await storeServerFile(png, 'image/png');
  createdFileIds.push(file.id);
  return { id: file.id, sha256: file.sourceSha256 ?? file.sha256 };
}

async function makePlainFile(mimeType: string): Promise<{ id: string; sha256: string }> {
  seq += 1;
  const file = await storeServerFile(Buffer.from(`bh-${RUN_ID}-${seq}`), mimeType);
  createdFileIds.push(file.id);
  return { id: file.id, sha256: file.sourceSha256 ?? file.sha256 };
}

describe('blurhash вложения (КЭШ-12)', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('фото с миниатюрой получает валидный blurhash', async () => {
    const alice = await registerUser('photo_a');
    const bob = await registerUser('photo_b');
    const { chatId } = await getOrCreatePrivateChat(alice.userId, bob.username);
    createdChatIds.push(chatId);

    const original = await makePlainFile('image/jpeg');
    const thumbnail = await makeThumbnail();

    const message = await sendMessage({
      chatId,
      senderId: alice.userId,
      clientId: `bh_${RUN_ID}_photo`,
      attachment: {
        fileId: original.id,
        sha256: original.sha256,
        thumbnailFileId: thumbnail.id,
        thumbnailSha256: thumbnail.sha256,
        originalName: 'shot.jpg',
      },
    });

    expect(message.attachment).not.toBeNull();
    expect(isBlurhash(message.attachment?.blurhash)).toBe(true);
  });

  it('файл без миниатюры уходит с blurhash null', async () => {
    const alice = await registerUser('file_a');
    const bob = await registerUser('file_b');
    const { chatId } = await getOrCreatePrivateChat(alice.userId, bob.username);
    createdChatIds.push(chatId);

    const document = await makePlainFile('application/pdf');

    const message = await sendMessage({
      chatId,
      senderId: alice.userId,
      clientId: `bh_${RUN_ID}_file`,
      attachment: { fileId: document.id, sha256: document.sha256, originalName: 'doc.pdf' },
    });

    expect(message.attachment?.blurhash).toBeNull();
  });

  it('битые байты не роняют счёт, а дают null', async () => {
    expect(await computeBlurhash(Buffer.from('это не картинка'))).toBeNull();
  });
});
