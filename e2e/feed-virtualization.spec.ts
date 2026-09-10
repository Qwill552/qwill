import { expect, test, type Page } from '@playwright/test';

import { registerUser, uniqueUser } from './helpers';
import { prisma } from '../server/src/db/prisma.js';

const SEED_COUNT = 900;
const WARMUP_STEPS = 6;
const WARMUP_PX = 2200;
const FLING_FRAMES = 40;
const FLING_STEP_PX = 150;

const SCROLLER = `(() => {
  const row = document.querySelector('.message-wrap');
  let el = row ? row.parentElement : null;
  while (el && !(el.scrollHeight > el.clientHeight + 8 && getComputedStyle(el).overflowY === 'auto')) el = el.parentElement;
  return el;
})()`;

interface FeedShape {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  renderedRows: number;
  averageRow: number;
  anchorId: number | null;
}

async function feedShape(page: Page): Promise<FeedShape> {
  return page.evaluate(`(() => {
    const el = ${SCROLLER};
    if (!el) return { scrollTop: 0, scrollHeight: 0, clientHeight: 0, renderedRows: 0, averageRow: 0, anchorId: null };
    const rows = el.querySelectorAll('.message-wrap');
    let total = 0;
    for (const row of rows) total += row.offsetHeight;

    const viewTop = el.getBoundingClientRect().top;
    let anchorId = null;
    for (const node of el.querySelectorAll('.message-wrap')) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= viewTop) continue;
      anchorId = Number(node.dataset.messageId);
      break;
    }

    return {
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: Math.round(el.scrollHeight),
      clientHeight: Math.round(el.clientHeight),
      renderedRows: rows.length,
      averageRow: rows.length === 0 ? 0 : total / rows.length,
      anchorId,
    };
  })()`) as Promise<FeedShape>;
}

async function scrollFeedBy(page: Page, pixels: number): Promise<void> {
  await page.evaluate(`(() => { const el = ${SCROLLER}; if (el) el.scrollBy({ top: ${pixels} }); })()`);
}

async function scrollFeedToBottom(page: Page): Promise<void> {
  await page.evaluate(`(() => { const el = ${SCROLLER}; if (el) el.scrollTop = el.scrollHeight; })()`);
}

async function flingUp(page: Page): Promise<void> {
  await page.evaluate(`(() => new Promise((done) => {
    const el = ${SCROLLER};
    if (!el) { done(null); return; }
    let frame = 0;
    function step() {
      el.scrollTop -= ${FLING_STEP_PX};
      frame += 1;
      if (frame < ${FLING_FRAMES}) requestAnimationFrame(step);
      else done(null);
    }
    requestAnimationFrame(step);
  }))()`);
}

async function warmUpHistory(page: Page): Promise<void> {
  for (let step = 0; step < WARMUP_STEPS; step += 1) {
    await scrollFeedBy(page, -WARMUP_PX);
    await page.waitForTimeout(500);
  }
  await scrollFeedToBottom(page);
  await page.waitForTimeout(700);
}

async function seedChatWithHistory(mineId: string, username: string, displayName: string): Promise<string> {
  const peer = await prisma.user.create({
    data: { username, displayName, passwordHash: 'e2e-not-a-real-hash' },
  });
  const chat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      pairKey: `${[mineId, peer.id].sort().join(':')}:feed`,
      members: { create: [{ userId: mineId }, { userId: peer.id }] },
    },
  });
  await prisma.message.createMany({
    data: Array.from({ length: SEED_COUNT }, (_, index) => ({
      chatId: chat.id,
      senderId: index % 2 === 0 ? peer.id : mineId,
      content: `строка номер ${index + 1}`,
    })),
  });
  return chat.id;
}

test('лента держит высоту всего накопителя, а не отрисованного окна (КЭШ-24a)', async ({ page }) => {
  test.setTimeout(180_000);

  const me = uniqueUser('feedgeom');
  const other = uniqueUser('feedgeomother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChatWithHistory(mine.id, other.username, other.displayName);

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(2000);
  await warmUpHistory(page);

  const shape = await feedShape(page);
  expect(shape.renderedRows, 'окно рендера не должно расти вместе с накопителем').toBeLessThanOrEqual(80);

  const heldRows = shape.scrollHeight / shape.averageRow;
  expect(heldRows, 'высота ленты должна покрывать накопитель, а не окно').toBeGreaterThan(shape.renderedRows * 1.4);
});

test('быстрый бросок вверх не упирается в невидимую стену (КЭШ-24a)', async ({ page }) => {
  test.setTimeout(180_000);

  const me = uniqueUser('feedfling');
  const other = uniqueUser('feedflingother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChatWithHistory(mine.id, other.username, other.displayName);

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(2000);
  await warmUpHistory(page);

  const before = await feedShape(page);
  expect(before.anchorId).not.toBeNull();

  await flingUp(page);
  await page.waitForTimeout(600);
  const after = await feedShape(page);

  expect(after.scrollTop, 'бросок закончился ударом о верхний край').toBeGreaterThan(600);
  expect(after.anchorId, 'после броска не видно ни одной строки').not.toBeNull();

  const travelled = (before.anchorId ?? 0) - (after.anchorId ?? 0);
  const expected = (FLING_FRAMES * FLING_STEP_PX) / before.averageRow;
  expect(travelled, 'лента проехала заметно меньше, чем её просили').toBeGreaterThan(expected * 0.7);
});

test('переход по закрепу к далёкому сообщению телепортирует и подсвечивает (КЭШ-24a)', async ({ page }) => {
  test.setTimeout(180_000);

  const me = uniqueUser('feedpin');
  const other = uniqueUser('feedpinother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChatWithHistory(mine.id, other.username, other.displayName);

  const oldest = await prisma.message.findFirstOrThrow({
    where: { chatId },
    orderBy: { id: 'asc' },
  });
  await prisma.chat.update({ where: { id: chatId }, data: { pinnedMessageId: oldest.id } });

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(2000);

  await expect(page.locator(`[data-message-id="${oldest.id}"]`)).toHaveCount(0);

  await page.getByRole('button', { name: /Закреплённое сообщение/ }).click();

  await expect(page.locator(`[data-message-id="${oldest.id}"][data-flash="1"]`)).toBeVisible({ timeout: 15_000 });
});

test('переход по закрепу к загруженному сообщению подсвечивает его (КЭШ-24a)', async ({ page }) => {
  test.setTimeout(180_000);

  const me = uniqueUser('feedpinnear');
  const other = uniqueUser('feedpinnearother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const chatId = await seedChatWithHistory(mine.id, other.username, other.displayName);

  const newest = await prisma.message.findFirstOrThrow({
    where: { chatId },
    orderBy: { id: 'desc' },
    skip: 3,
  });
  await prisma.chat.update({ where: { id: chatId }, data: { pinnedMessageId: newest.id } });

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(2000);
  await scrollFeedBy(page, -1200);
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: /Закреплённое сообщение/ }).click();

  await expect(page.locator(`[data-message-id="${newest.id}"][data-flash="1"]`)).toBeVisible({ timeout: 15_000 });
});
