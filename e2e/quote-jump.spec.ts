import { expect, test, type Page } from '@playwright/test';

import { registerUser, uniqueUser } from './helpers';
import { prisma } from '../server/src/db/prisma.js';

const LONG_TEXT = Array.from({ length: 9 }, (_, line) => `длинная строка номер ${line + 1}, чтобы пузырь был высоким`).join(String.fromCharCode(10));

async function seed(page: Page, label: string, targetIndex: number, varied = false): Promise<{ chatId: string; targetId: number }> {
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
      data: {
        chatId: chat.id,
        senderId: index % 2 === 0 ? peer.id : mine.id,
        content: varied && index % 3 === 0 ? [`история ${index + 1}`, LONG_TEXT].join(String.fromCharCode(10)) : `история ${index + 1}`,
      },
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

test('строки разной высоты: прыжок доезжает до цитаты и не срывается пересчётом высот', async ({ page }) => {
  test.setTimeout(120_000);
  const { targetId } = await seed(page, 'qvar', 73, true);
  const answer = page.locator('.message-wrap', { hasText: 'ответ с цитатой' });
  await expect(answer).toBeInViewport({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await answer.locator('[data-reply-quote]').click();
  const target = page.locator(`.message-wrap[data-message-id="${targetId}"]`);
  await expect(target).toBeInViewport({ timeout: 8000 });
  await page.waitForTimeout(2000);
  await expect(target).toBeInViewport();
});
