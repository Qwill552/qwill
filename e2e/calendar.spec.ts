import { expect, test, type Page } from '@playwright/test';

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { registerUser, uniqueUser } from './helpers';
import { prisma } from '../server/src/db/prisma.js';

/** 1×1 PNG — достаточно, чтобы <img> в ячейке дня либо загрузился, либо нет. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function storePng(): Promise<{ id: string; sha256: string }> {
  const sha256 = createHash('sha256').update(PNG_1PX).digest('hex');
  const dir = path.resolve(process.cwd(), 'storage', 'files');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, sha256), PNG_1PX);
  const file = await prisma.file.upsert({
    where: { sha256 },
    update: {},
    create: { sha256, storedName: sha256, mimeType: 'image/png', size: PNG_1PX.length },
  });
  return { id: file.id, sha256 };
}

const DAY_MS = 86_400_000;
const PER_DAY = 120;

interface SeededDay {
  offsetDays: number;
  firstText: string;
}

const DAYS: SeededDay[] = [
  { offsetDays: 11, firstText: 'далёкий день строка 1' },
  { offsetDays: 9, firstText: 'предпоследний день строка 1' },
  { offsetDays: 7, firstText: 'средний день строка 1' },
  { offsetDays: 3, firstText: 'недавний день строка 1' },
  { offsetDays: 0, firstText: 'сегодняшний день строка 1' },
];

function labelOf(offsetDays: number): RegExp {
  const date = new Date(Date.now() - offsetDays * DAY_MS);
  const text = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return new RegExp(`^${text}`);
}

async function seedChat(mineId: string, username: string, displayName: string): Promise<string> {
  const peer = await prisma.user.create({
    data: { username, displayName, passwordHash: 'e2e-not-a-real-hash' },
  });
  const chat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      pairKey: `${[mineId, peer.id].sort().join(':')}:calendar`,
      members: { create: [{ userId: mineId }, { userId: peer.id }] },
    },
  });

  for (const day of DAYS) {
    const base = Date.now() - day.offsetDays * DAY_MS;
    await prisma.message.createMany({
      data: Array.from({ length: PER_DAY }, (_, index) => ({
        chatId: chat.id,
        senderId: index % 2 === 0 ? peer.id : mineId,
        content: index === 0 ? day.firstText : `${day.firstText.split(' ')[0]} строка ${index + 1}`,
        createdAt: new Date(base - (PER_DAY - index) * 60_000),
      })),
    });
  }

  return chat.id;
}

async function openCalendarFromFeed(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Календарь, / }).last().click();
  await expect(page.getByRole('dialog', { name: 'Календарь' })).toBeVisible();
}

test('выбор дня в календаре переносит ленту к первому сообщению этого дня', async ({ page }) => {
  test.setTimeout(120_000);

  const me = uniqueUser('cal');
  const other = uniqueUser('calother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChat(mine.id, other.username, other.displayName);

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(1500);

  await openCalendarFromFeed(page);

  const far = page.getByRole('dialog', { name: 'Календарь' }).getByRole('button', { name: labelOf(11) });
  await expect(far).toBeEnabled();
  await far.click();

  await expect(page.getByRole('dialog', { name: 'Календарь' })).toBeHidden();
  await expect(page.getByText(DAYS[0]!.firstText, { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('день без сообщений не нажимается', async ({ page }) => {
  test.setTimeout(120_000);

  const me = uniqueUser('calempty');
  const other = uniqueUser('calemptyother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChat(mine.id, other.username, other.displayName);

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(1500);

  await openCalendarFromFeed(page);

  const quiet = page.getByRole('dialog', { name: 'Календарь' }).getByRole('button', { name: labelOf(10) });
  await expect(quiet).toBeDisabled();
});

test('шит календаря не вылезает за экран и прокручивается внутри себя', async ({ page }) => {
  test.setTimeout(120_000);

  const me = uniqueUser('calfit');
  const other = uniqueUser('calfitother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChat(mine.id, other.username, other.displayName);

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(1500);

  await openCalendarFromFeed(page);

  const sheet = page.getByRole('dialog', { name: 'Календарь' });
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, 'шит должен быть на экране').not.toBeNull();
  expect(box!.y, 'верх шита не должен уезжать выше экрана').toBeGreaterThanOrEqual(0);
  expect(box!.height, 'шит не должен быть выше экрана').toBeLessThanOrEqual(viewport.height);

  const scrolls = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Календарь"]');
    const body = dialog?.querySelector('div[class*="body"]') as HTMLElement | null;
    if (!body) return null;
    const before = body.scrollTop;
    body.scrollTop = body.scrollHeight;
    return { before, after: body.scrollTop, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
  });
  expect(scrolls, 'тело шита должно находиться').not.toBeNull();
  expect(scrolls!.scrollHeight, 'месяцы должны прокручиваться внутри шита').toBeGreaterThan(scrolls!.clientHeight);
});

test('миниатюра дня в календаре действительно грузится', async ({ page }) => {
  test.setTimeout(120_000);

  const me = uniqueUser('calpic');
  const other = uniqueUser('calpicother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChat(mine.id, other.username, other.displayName);

  const file = await storePng();
  const withPhoto = await prisma.message.findFirstOrThrow({
    where: { chatId },
    orderBy: { id: 'asc' },
  });
  await prisma.attachment.create({
    data: { messageId: withPhoto.id, fileId: file.id, originalName: 'p.png', width: 1, height: 1 },
  });

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(1500);

  await openCalendarFromFeed(page);

  const cell = page.getByRole('dialog', { name: 'Календарь' }).getByRole('button', { name: labelOf(11) });
  await expect(cell).toBeEnabled();
  const image = cell.locator('img');
  await expect(image).toBeVisible({ timeout: 15_000 });
  const loaded = await image.evaluate((node) => (node as HTMLImageElement).naturalWidth > 0);
  expect(loaded, 'миниатюра дня должна прийти с токеном, а не получить 401').toBe(true);
});
