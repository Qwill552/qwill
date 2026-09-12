import { expect, test, type Page } from '@playwright/test';

import { registerUser, uniqueUser } from './helpers';
import { prisma } from '../server/src/db/prisma.js';

const TOTAL = 600;
const OLDEST_MATCH = 'тыквенный пирог у самого начала';
const NEWEST_MATCH = 'тыквенный суп в самом конце';
const MINUTE_MS = 60_000;

async function seedChat(mineId: string, username: string, displayName: string): Promise<string> {
  const peer = await prisma.user.create({
    data: { username, displayName, passwordHash: 'e2e-not-a-real-hash' },
  });
  const chat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      pairKey: `${[mineId, peer.id].sort().join(':')}:chatsearch`,
      members: { create: [{ userId: mineId }, { userId: peer.id }] },
    },
  });

  const base = Date.now() - TOTAL * MINUTE_MS;
  await prisma.message.createMany({
    data: Array.from({ length: TOTAL }, (_, index) => ({
      chatId: chat.id,
      senderId: index % 2 === 0 ? peer.id : mineId,
      content: index === 0 ? OLDEST_MATCH : index === TOTAL - 1 ? NEWEST_MATCH : `обычная строка ${index + 1}`,
      createdAt: new Date(base + index * MINUTE_MS),
    })),
  });

  return chat.id;
}

async function openSearch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitem', { name: 'Поиск' }).click();
  await expect(page.getByRole('textbox', { name: 'Поиск в чате' })).toBeVisible();
}

test('поиск в чате: прыжок к самому старому совпадению вне загруженного окна', async ({ page }) => {
  test.setTimeout(120_000);

  const me = uniqueUser('csearch');
  const other = uniqueUser('csearchother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChat(mine.id, other.username, other.displayName);

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(1500);

  await openSearch(page);
  await expect(page.getByText(`1 из ${TOTAL}`)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('textbox', { name: 'Поиск в чате' }).fill('тыкв');
  await page.getByRole('textbox', { name: 'Поиск в чате' }).press('Enter');

  await expect(page.getByText('1 из 2')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(NEWEST_MATCH, { exact: true })).toBeVisible();

  const older = page.getByRole('button', { name: 'К более старому совпадению' });
  const newer = page.getByRole('button', { name: 'К более новому совпадению' });
  await expect(newer).toBeDisabled();

  await older.click();
  await expect(page.getByText('2 из 2')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(OLDEST_MATCH, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(older, 'на краю выдачи стрелка гаснет, а не циклит').toBeDisabled();

  await newer.click();
  await expect(page.getByText('1 из 2')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(NEWEST_MATCH, { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('поиск в чате: «Списком» открывает выдачу, тап по строке возвращает в чат', async ({ page }) => {
  test.setTimeout(120_000);

  const me = uniqueUser('cslist');
  const other = uniqueUser('cslistother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChat(mine.id, other.username, other.displayName);

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(1500);

  await openSearch(page);
  await page.getByRole('textbox', { name: 'Поиск в чате' }).fill('тыкв');
  await page.getByRole('textbox', { name: 'Поиск в чате' }).press('Enter');
  await expect(page.getByText('1 из 2')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Списком' }).click();
  await expect(page.getByText('2 результата')).toBeVisible();

  await page.getByRole('button', { name: new RegExp(OLDEST_MATCH) }).click();

  await expect(page.getByRole('button', { name: 'Списком' })).toBeVisible();
  await expect(page.getByText('2 из 2')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(OLDEST_MATCH, { exact: true })).toBeVisible({ timeout: 15_000 });
});
