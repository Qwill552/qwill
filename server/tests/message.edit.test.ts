import supertest from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { getOrCreatePrivateChat } from '../src/services/chat.js';
import { editMessage, sendMessage } from '../src/services/message.js';

const app = createApp();
const request = supertest(app);

const RUN_ID = Date.now().toString(36);
const createdUserIds: string[] = [];
const createdChatIds: string[] = [];

async function registerUser(suffix: string): Promise<{ userId: string; username: string }> {
  const username = `edit_${RUN_ID}_${suffix}`;
  const res = await request.post('/api/auth/register').send({ username, password: 'password123', displayName: suffix , termsVersion: '1.0', privacyVersion: '1.0' });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id as string);
  return { userId: res.body.user.id as string, username };
}

async function privateChat(suffix: string): Promise<{ chatId: string; authorId: string }> {
  const author = await registerUser(`${suffix}_a`);
  const peer = await registerUser(`${suffix}_b`);
  const { chatId } = await getOrCreatePrivateChat(author.userId, peer.username);
  createdChatIds.push(chatId);
  return { chatId, authorId: author.userId };
}

describe('editMessage — изменить можно только текстовое сообщение', () => {
  afterAll(async () => {
    await prisma.chat.deleteMany({ where: { id: { in: createdChatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('меняет содержимое своего текстового сообщения', async () => {
    const { chatId, authorId } = await privateChat('text');
    const sent = await sendMessage({
      chatId,
      senderId: authorId,
      clientId: `${RUN_ID}-text`,
      content: 'Было',
    });

    const edited = await editMessage({ chatId, messageId: sent.id, userId: authorId, content: 'Стало' });

    expect(edited.content).toBe('Стало');
    expect(edited.editedAt).not.toBeNull();
  });

  it.each(['MEDIA', 'CALL', 'ANNOUNCEMENT', 'SYSTEM'] as const)('отказывает для типа %s', async (type) => {
    const { chatId, authorId } = await privateChat(type.toLowerCase());
    const message = await prisma.message.create({
      data: { chatId, senderId: authorId, clientId: `${RUN_ID}-${type}`, type, content: 'Подпись' },
    });

    await expect(
      editMessage({ chatId, messageId: message.id, userId: authorId, content: 'Другая подпись' }),
    ).rejects.toThrow('Изменить можно только текстовое сообщение');

    const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored.content).toBe('Подпись');
    expect(stored.editedAt).toBeNull();
  });
});
