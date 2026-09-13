import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { UPLOAD_OFFSET_HEADER } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { ensureStorageDirs } from '../src/services/file.js';
import { sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];
const createdStoredNames: string[] = [];

let owner: { token: string; userId: string };
let chatId: string;
let clientSeq = 0;

async function registerUser(suffix: string): Promise<{ token: string; userId: string; username: string }> {
  const username = `fsv_${RUN_ID}_${suffix}`;
  const res = await request
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: 'Файлы' , termsVersion: '1.0', privacyVersion: '1.0' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, username };
}

function sha256Of(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function bodyOf(head: number[], tag: string): Buffer {
  return Buffer.concat([Buffer.from(head), Buffer.from(`${RUN_ID}:${tag}`)]);
}

interface UploadResult {
  status: number;
  fileId?: string;
  mimeType?: string;
  sha256: string;
}

async function upload(
  token: string,
  body: Buffer,
  mimeType: string,
  originalName: string,
  purpose: 'message' | 'avatar' = 'message',
): Promise<UploadResult> {
  const sha256 = sha256Of(body);
  const init = await request
    .post('/api/files/upload')
    .set('Authorization', `Bearer ${token}`)
    .send({ sha256, size: body.length, mimeType, originalName, purpose });
  if (init.status !== 201) return { status: init.status, sha256 };

  const sent = await request
    .patch(`/api/files/upload/${init.body.sessionId}`)
    .set('Authorization', `Bearer ${token}`)
    .set(UPLOAD_OFFSET_HEADER, '0')
    .set('Content-Type', 'application/octet-stream')
    .send(body);
  if (sent.status !== 200 || !sent.body.done) return { status: sent.status, sha256 };

  const stored = await prisma.file.findUniqueOrThrow({ where: { id: sent.body.file.id } });
  createdStoredNames.push(stored.storedName);
  return { status: init.status, fileId: stored.id, mimeType: stored.mimeType, sha256 };
}

async function attach(fileId: string, sha256: string, originalName: string): Promise<void> {
  clientSeq += 1;
  await sendMessage({
    chatId,
    senderId: owner.userId,
    clientId: `fsv_${RUN_ID}_${clientSeq}`,
    attachment: { fileId, sha256, originalName },
  });
}

async function uploadAndAttach(body: Buffer, mimeType: string, originalName: string): Promise<UploadResult> {
  const result = await upload(owner.token, body, mimeType, originalName);
  expect(result.fileId).toBeDefined();
  await attach(result.fileId!, result.sha256, originalName);
  return result;
}

describe('приём файла любого типа и безопасная раздача (КЭШ-21a)', () => {
  beforeAll(async () => {
    await ensureStorageDirs();
    owner = await registerUser('owner');
    const peer = await registerUser('peer');
    const chat = await getOrCreatePrivateChat(owner.userId, peer.username);
    chatId = chat.chatId;
    createdChatIds.push(chatId);
  });

  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.file.deleteMany({ where: { storedName: { in: createdStoredNames } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    for (const storedName of createdStoredNames) {
      await fs.unlink(path.join(env.storageDir, 'files', storedName)).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('исполняемый файл принимается и хранит заявленный тип', async () => {
    const result = await upload(
      owner.token,
      bodyOf([0x4d, 0x5a, 0x90, 0x00], 'exe'),
      'application/x-msdownload',
      'setup.exe',
    );
    expect(result.status).toBe(201);
    expect(result.mimeType).toBe('application/x-msdownload');
  });

  it('mkv принимается как документ', async () => {
    const result = await upload(
      owner.token,
      bodyOf([0x1a, 0x45, 0xdf, 0xa3], 'mkv'),
      'video/x-matroska',
      'кино.mkv',
    );
    expect(result.status).toBe(201);
    expect(result.mimeType).toBe('video/x-matroska');
  });

  it('docx принимается и не подменяется на zip по сигнатуре', async () => {
    const result = await upload(
      owner.token,
      bodyOf([0x50, 0x4b, 0x03, 0x04], 'docx'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'договор.docx',
    );
    expect(result.status).toBe(201);
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('файл без типа принимается как поток байт', async () => {
    const result = await upload(owner.token, bodyOf([0x00, 0x01, 0x02, 0x03], 'blob'), 'application/octet-stream', 'dump');
    expect(result.status).toBe(201);
    expect(result.mimeType).toBe('application/octet-stream');
  });

  it('аватар с текстовым типом по-прежнему отбивается', async () => {
    const result = await upload(owner.token, bodyOf([0x68, 0x69, 0x0a], 'ava'), 'text/plain', 'note.txt', 'avatar');
    expect(result.status).toBe(415);
  });

  it('аватар с картиночным типом, но чужим содержимым, отбивается по сигнатуре', async () => {
    const result = await upload(owner.token, bodyOf([0x00, 0x01, 0x02], 'avapng'), 'image/png', 'fake.png', 'avatar');
    expect(result.status).toBe(415);
  });

  it('обещанный png с чужим содержимым понижается, а не отбивается', async () => {
    const result = await upload(owner.token, bodyOf([0xff, 0xd8, 0xff], 'liar'), 'image/png', 'liar.png');
    expect(result.status).toBe(201);
    expect(result.mimeType).toBe('application/octet-stream');
  });

  it('не-отображаемый тип уезжает вложением и с nosniff', async () => {
    const result = await uploadAndAttach(bodyOf([0x4d, 0x5a, 0x90, 0x01], 'serve-exe'), 'application/x-msdownload', 'run.exe');

    const res = await request
      .get(`/api/files/${result.fileId}?name=run.exe`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="run.exe"; filename*=UTF-8''run.exe`);
  });

  it('отображаемый тип отдаётся собой и без Content-Disposition', async () => {
    const result = await uploadAndAttach(bodyOf([0xff, 0xd8, 0xff], 'serve-jpg'), 'image/jpeg', 'photo.jpg');

    const res = await request
      .get(`/api/files/${result.fileId}?name=photo.jpg`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('заголовки те же и в ответе на Range', async () => {
    const result = await uploadAndAttach(bodyOf([0x25, 0x50, 0x44, 0x46], 'serve-pdf'), 'application/pdf', 'счёт.pdf');

    const res = await request
      .get(`/api/files/${result.fileId}?name=${encodeURIComponent('счёт.pdf')}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('Range', 'bytes=0-2');

    expect(res.status).toBe(206);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''%D1%81%D1%87%D1%91%D1%82.pdf");
  });

  it('русское имя с кавычками переживает выдачу', async () => {
    const result = await uploadAndAttach(bodyOf([0x25, 0x50, 0x44, 0x47], 'serve-name'), 'application/pdf', 'отчёт.pdf');

    const res = await request
      .get(`/api/files/${result.fileId}?name=${encodeURIComponent('отчёт "за" год.pdf')}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="_____ __ ___.pdf"; filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82%20%D0%B7%D0%B0%20%D0%B3%D0%BE%D0%B4.pdf`,
    );
  });

  it('перевод строки в имени не расщепляет заголовок', async () => {
    const result = await uploadAndAttach(bodyOf([0x4d, 0x5a, 0x90, 0x02], 'serve-crlf'), 'application/x-msdownload', 'x.exe');

    const res = await request
      .get(`/api/files/${result.fileId}?name=${encodeURIComponent('a\r\nX-Injected: 1.exe')}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-injected']).toBeUndefined();
    expect(res.headers['content-disposition']).not.toContain('\n');
    expect(res.headers['content-disposition']).toContain('aX-Injected: 1.exe');
  });
});
