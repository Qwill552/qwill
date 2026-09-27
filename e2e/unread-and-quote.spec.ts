import { expect, test, type Page } from '@playwright/test';

import { registerUser, uniqueUser } from './helpers';
import { prisma } from '../server/src/db/prisma.js';

const SCROLLER = `(() => {
  const row = document.querySelector('.message-wrap');
  let el = row ? row.parentElement : null;
  while (el && !(el.scrollHeight > el.clientHeight + 8 && getComputedStyle(el).overflowY === 'auto')) el = el.parentElement;
  return el;
})()`;

async function seedPeer(username: string, displayName: string): Promise<string> {
  const peer = await prisma.user.create({ data: { username, displayName, passwordHash: 'e2e-not-a-real-hash' } });
  return peer.id;
}

async function seedChat(mineId: string, peerId: string, contents: { sender: string; text: string }[]): Promise<{ chatId: string; ids: number[] }> {
  const chat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      pairKey: `${[mineId, peerId].sort().join(':')}:${Date.now()}`,
      members: { create: [{ userId: mineId }, { userId: peerId }] },
    },
  });
  const ids: number[] = [];
  for (const item of contents) {
    const created = await prisma.message.create({ data: { chatId: chat.id, senderId: item.sender, content: item.text } });
    ids.push(created.id);
  }
  return { chatId: chat.id, ids };
}

async function readCursor(chatId: string, userId: string): Promise<number | null> {
  const member = await prisma.chatMember.findUniqueOrThrow({ where: { chatId_userId: { chatId, userId } } });
  return member.lastReadMessageId;
}

async function openFromList(page: Page, chatId: string): Promise<void> {
  await page.goto('/chats');
  await page.locator(`a[href="/chats/${chatId}"], [data-chat-id="${chatId}"]`).first().click();
  await page.waitForURL(`**/chats/${chatId}`);
}

test('чат с непрочитанными открывается на разделителе и читается по мере прокрутки', async ({ page }) => {
  test.setTimeout(120_000);
  const me = uniqueUser('unrmine');
  const other = uniqueUser('unrpeer');
  await registerUser(page, me);
  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const peerId = await seedPeer(other.username, other.displayName);

  const read = Array.from({ length: 80 }, (_, index) => ({ sender: index % 2 === 0 ? peerId : mine.id, text: `прочитано ${index + 1}` }));
  const unread = Array.from({ length: 40 }, (_, index) => ({ sender: peerId, text: `новое ${index + 1}` }));
  const { chatId, ids } = await seedChat(mine.id, peerId, [...read, ...unread]);
  const lastRead = ids[79]!;
  const lastId = ids[ids.length - 1]!;
  await prisma.chatMember.update({ where: { chatId_userId: { chatId, userId: mine.id } }, data: { lastReadMessageId: lastRead } });

  await openFromList(page, chatId);

  const divider = page.locator('[data-unread-divider]');
  await expect(divider).toBeVisible();
  await expect(divider).toHaveText('Непрочитанные · 40');
  const placement = (await page.evaluate(`(() => {
    const el = ${SCROLLER};
    const divider = document.querySelector('[data-unread-divider]');
    const list = el.getBoundingClientRect();
    const rect = divider.getBoundingClientRect();
    return { center: (rect.top + rect.bottom) / 2 - list.top, height: el.clientHeight, distance: el.scrollHeight - el.scrollTop - el.clientHeight };
  })()`)) as { center: number; height: number; distance: number };
  expect(placement.center).toBeGreaterThan(placement.height * 0.3);
  expect(placement.center).toBeLessThan(placement.height * 0.7);
  expect(placement.distance).toBeGreaterThan(400);

  await page.waitForTimeout(1500);
  const partial = await readCursor(chatId, mine.id);
  expect(partial).not.toBeNull();
  expect(partial!).toBeGreaterThan(lastRead);
  expect(partial!).toBeLessThan(lastId);

  await page.evaluate(`(() => { const el = ${SCROLLER}; el.scrollTop = el.scrollHeight; })()`);
  await expect.poll(() => readCursor(chatId, mine.id), { timeout: 10_000 }).toBe(lastId);
});

test('цитата ведёт к оригиналу, «вниз» возвращает к ответу; пузырь следует размеру шрифта', async ({ page }) => {
  test.setTimeout(120_000);
  const me = uniqueUser('qtmine');
  const other = uniqueUser('qtpeer');
  await registerUser(page, me);
  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const peerId = await seedPeer(other.username, other.displayName);

  const history = Array.from({ length: 120 }, (_, index) => ({ sender: index % 2 === 0 ? peerId : mine.id, text: `история ${index + 1}` }));
  const { chatId, ids } = await seedChat(mine.id, peerId, history);
  const reply = await prisma.message.create({ data: { chatId, senderId: peerId, content: 'ответ на пятое', replyToId: ids[4]! } });
  await prisma.chatMember.update({ where: { chatId_userId: { chatId, userId: mine.id } }, data: { lastReadMessageId: reply.id } });

  await openFromList(page, chatId);
  const answer = page.locator('.message-wrap', { hasText: 'ответ на пятое' });
  await expect(answer).toBeInViewport();

  await answer.locator('[data-reply-quote]').click();
  const original = page.locator(`.message-wrap[data-message-id="${ids[4]!}"]`);
  await expect(original).toBeInViewport({ timeout: 10_000 });
  await expect(answer).not.toBeInViewport();

  await page.getByRole('button', { name: 'К последним сообщениям' }).click();
  await expect(answer).toBeInViewport({ timeout: 10_000 });

  const sizes = await page.evaluate(() => {
    const bubble = document.querySelector<HTMLElement>('.message-wrap [data-reply-quote]')?.parentElement;
    if (!bubble) return null;
    const before = getComputedStyle(bubble).fontSize;
    document.documentElement.dataset.fontSize = 'large';
    const after = getComputedStyle(bubble).fontSize;
    document.documentElement.dataset.fontSize = 'medium';
    return { before, after };
  });
  expect(sizes).toEqual({ before: '15px', after: '17px' });

  const jumpOverflow = await page.getByRole('button', { name: 'К последним сообщениям' }).evaluate((node) => getComputedStyle(node).overflow);
  expect(jumpOverflow).not.toBe('hidden');
});
