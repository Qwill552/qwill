import { expect, test, type Page } from '@playwright/test';

import { registerUser, uniqueUser } from './helpers';
import { prisma } from '../server/src/db/prisma.js';

async function seed(page: Page, label: string, targetIndex: number): Promise<{ chatId: string; targetId: number }> {
  const me = uniqueUser(label);
  const other = uniqueUser(`${label}p`);
  await registerUser(page, me);
  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const peer = await prisma.user.create({ data: { username: other.username, displayName: other.displayName, passwordHash: 'x' } });
  const chat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      pairKey: `${[mine.id, peer.id].sort().join(':')}:${Date.now()}`,
      members: { create: [{ userId: mine.id }, { userId: peer.id }] },
    },
  });
  const ids: number[] = [];
  for (let index = 0; index < 120; index += 1) {
    const created = await prisma.message.create({
      data: { chatId: chat.id, senderId: index % 2 === 0 ? peer.id : mine.id, content: `история ${index + 1}` },
    });
    ids.push(created.id);
  }
  const reply = await prisma.message.create({ data: { chatId: chat.id, senderId: peer.id, content: 'ответ с цитатой', replyToId: ids[targetIndex]! } });
  await prisma.chatMember.update({ where: { chatId_userId: { chatId: chat.id, userId: mine.id } }, data: { lastReadMessageId: reply.id } });
  await page.goto('/chats');
  await page.locator(`a[href="/chats/${chat.id}"], [data-chat-id="${chat.id}"]`).first().click();
  await page.waitForURL(`**/chats/${chat.id}`);
  return { chatId: chat.id, targetId: ids[targetIndex]! };
}

for (const [name, index] of [
  ['в накопителе, выше экрана', 80],
  ['далеко, не загружен', 4],
] as const) {
  test(`мышь: цитата ${name}`, async ({ page }) => {
    test.setTimeout(90_000);
    const { targetId } = await seed(page, `qm${index}`, index);
    const answer = page.locator('.message-wrap', { hasText: 'ответ с цитатой' });
    await expect(answer).toBeInViewport();
    await page.waitForTimeout(1000);
    await answer.locator('[data-reply-quote]').click();
    await expect(page.locator(`.message-wrap[data-message-id="${targetId}"]`)).toBeInViewport({ timeout: 8000 });
  });
}

test.describe('касание', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [name, index] of [
    ['в накопителе, выше экрана', 80],
    ['далеко, не загружен', 4],
  ] as const) {
    test(`палец: цитата ${name}`, async ({ page }) => {
      test.setTimeout(90_000);
      const { targetId } = await seed(page, `qt${index}`, index);
      const answer = page.locator('.message-wrap', { hasText: 'ответ с цитатой' });
      await expect(answer).toBeInViewport();
      await page.waitForTimeout(1000);
      await answer.locator('[data-reply-quote]').tap();
      await expect(page.locator(`.message-wrap[data-message-id="${targetId}"]`)).toBeInViewport({ timeout: 8000 });
    });
  }
});
