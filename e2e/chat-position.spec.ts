import { expect, test, type Page } from '@playwright/test';

import { registerUser, uniqueUser } from './helpers';
import { prisma } from '../server/src/db/prisma.js';

const SEED_COUNT = 600;
const SCROLL_UP_PX = 2400;
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

const SCROLLER = `(() => {
  const row = document.querySelector('.message-wrap');
  let el = row ? row.parentElement : null;
  while (el && !(el.scrollHeight > el.clientHeight + 8 && getComputedStyle(el).overflowY === 'auto')) el = el.parentElement;
  return el;
})()`;

interface FeedView {
  anchorId: number | null;
  anchorTop: number;
  distanceToBottom: number;
}

async function feedView(page: Page): Promise<FeedView> {
  return page.evaluate(`(() => {
    const el = ${SCROLLER};
    if (!el) return { anchorId: null, anchorTop: 0, distanceToBottom: 0 };
    const viewTop = el.getBoundingClientRect().top;
    let anchorId = null;
    let anchorTop = 0;
    for (const node of el.querySelectorAll('.message-wrap')) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= viewTop) continue;
      anchorId = Number(node.dataset.messageId);
      anchorTop = Math.round(rect.top - viewTop);
      break;
    }
    return { anchorId, anchorTop, distanceToBottom: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight) };
  })()`) as Promise<FeedView>;
}

async function scrollFeedUp(page: Page, pixels: number): Promise<void> {
  await page.evaluate(`(() => { const el = ${SCROLLER}; if (el) el.scrollBy({ top: ${-pixels} }); })()`);
}

async function watchEntry(page: Page): Promise<{ view: FeedView; closestToBottom: number }> {
  let closestToBottom = Number.POSITIVE_INFINITY;
  let view = await feedView(page);
  for (let step = 0; step < 20; step += 1) {
    view = await feedView(page);
    if (view.anchorId !== null) closestToBottom = Math.min(closestToBottom, view.distanceToBottom);
    await page.waitForTimeout(120);
  }
  return { view, closestToBottom };
}

async function seedPeer(username: string, displayName: string): Promise<string> {
  const peer = await prisma.user.create({
    data: { username, displayName, passwordHash: 'e2e-not-a-real-hash' },
  });
  return peer.id;
}

async function seedChat(mineId: string, peerId: string, prefix: string): Promise<string> {
  const chat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      pairKey: `${[mineId, peerId].sort().join(':')}:${prefix}`,
      members: { create: [{ userId: mineId }, { userId: peerId }] },
    },
  });
  await prisma.message.createMany({
    data: Array.from({ length: SEED_COUNT }, (_, index) => ({
      chatId: chat.id,
      senderId: index % 2 === 0 ? peerId : mineId,
      content: `${prefix}: строка номер ${index + 1}`,
    })),
  });
  return chat.id;
}

test('чат открывается там же, где его оставили, и не мигает хвостом (КЭШ-17)', async ({ page }) => {
  test.setTimeout(180_000);

  const me = uniqueUser('posmine');
  const other = uniqueUser('posother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const peerId = await seedPeer(other.username, other.displayName);
  const chatId = await seedChat(mine.id, peerId, 'A');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

  await page.goto(`/chats/${chatId}`);
  await expect(page.locator('.message-wrap').last()).toBeVisible();
  await page.waitForTimeout(2000);

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await scrollFeedUp(page, SCROLL_UP_PX);
    await page.waitForTimeout(900);
    const before = await feedView(page);
    expect(before.anchorId, `цикл ${cycle}: подъём вверх не сработал`).not.toBeNull();
    expect(before.distanceToBottom).toBeGreaterThan(600);

    await page.getByRole('button', { name: 'Назад к чатам' }).click();
    await page.waitForURL('**/chats');
    await page.locator(`a[href="/chats/${chatId}"], [data-chat-id="${chatId}"]`).first().click();
    await page.waitForURL(`**/chats/${chatId}`);

    const { view, closestToBottom } = await watchEntry(page);

    expect(view.anchorId, `цикл ${cycle}: вернулись не к тому сообщению`).toBe(before.anchorId);
    expect(Math.abs(view.anchorTop - before.anchorTop), `цикл ${cycle}: место сместилось`).toBeLessThan(8);
    expect(closestToBottom, `цикл ${cycle}: лента на входе сорвалась в хвост`).toBeGreaterThan(600);
  }
});

test.describe('десктопная раскладка', () => {
  test('переход между чатами не сбрасывает место (КЭШ-17a)', async ({ page }) => {
    test.setTimeout(180_000);

    const me = uniqueUser('deskmine');
    const other = uniqueUser('deskother');
    await registerUser(page, me);
    await page.setViewportSize(DESKTOP_VIEWPORT);

    const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
    const peerId = await seedPeer(other.username, other.displayName);
    const chatA = await seedChat(mine.id, peerId, 'A');
    const chatB = await seedChat(mine.id, peerId, 'B');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

    async function openFromList(chatId: string): Promise<void> {
      await page.locator(`a[href="/chats/${chatId}"], [data-chat-id="${chatId}"]`).first().click();
      await page.waitForURL(`**/chats/${chatId}`);
    }

    async function settleUp(label: string): Promise<FeedView> {
      await expect(page.locator('.message-wrap').last()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(2000);
      await scrollFeedUp(page, SCROLL_UP_PX);
      await page.waitForTimeout(900);
      const view = await feedView(page);
      expect(view.anchorId, `${label}: подъём вверх не сработал`).not.toBeNull();
      expect(view.distanceToBottom, `${label}: подъём вверх не сработал`).toBeGreaterThan(600);
      return view;
    }

    await page.goto(`/chats/${chatA}`);
    const beforeA = await settleUp('чат A');

    await openFromList(chatB);
    const beforeB = await settleUp('чат B');

    for (let cycle = 1; cycle <= 2; cycle += 1) {
      await openFromList(chatA);
      const backToA = await watchEntry(page);
      expect(backToA.view.anchorId, `цикл ${cycle}: чат A открылся не на своём месте`).toBe(beforeA.anchorId);
      expect(
        Math.abs(backToA.view.anchorTop - beforeA.anchorTop),
        `цикл ${cycle}: место чата A сместилось`,
      ).toBeLessThan(8);
      expect(backToA.closestToBottom, `цикл ${cycle}: чат A сорвался в хвост`).toBeGreaterThan(600);

      await openFromList(chatB);
      const backToB = await watchEntry(page);
      expect(backToB.view.anchorId, `цикл ${cycle}: чат B открылся не на своём месте`).toBe(beforeB.anchorId);
      expect(
        Math.abs(backToB.view.anchorTop - beforeB.anchorTop),
        `цикл ${cycle}: место чата B сместилось`,
      ).toBeLessThan(8);
      expect(backToB.closestToBottom, `цикл ${cycle}: чат B сорвался в хвост`).toBeGreaterThan(600);
    }
  });

  test('чат, покинутый в конце ленты, открывается в конце (КЭШ-17a)', async ({ page }) => {
    test.setTimeout(180_000);

    const me = uniqueUser('desktail');
    const other = uniqueUser('desktailother');
    await registerUser(page, me);
    await page.setViewportSize(DESKTOP_VIEWPORT);

    const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
    const peerId = await seedPeer(other.username, other.displayName);
    const chatA = await seedChat(mine.id, peerId, 'A');
    const chatB = await seedChat(mine.id, peerId, 'B');

    async function openFromList(chatId: string): Promise<void> {
      await page.locator(`a[href="/chats/${chatId}"], [data-chat-id="${chatId}"]`).first().click();
      await page.waitForURL(`**/chats/${chatId}`);
      await expect(page.locator('.message-wrap').last()).toBeVisible();
      await page.waitForTimeout(2000);
    }

    await page.goto(`/chats/${chatA}`);
    await expect(page.locator('.message-wrap').last()).toBeVisible();
    await page.waitForTimeout(2000);

    await openFromList(chatB);
    await openFromList(chatA);
    await page.waitForTimeout(600);

    const view = await feedView(page);
    expect(view.distanceToBottom, 'чат, покинутый в конце, открылся не в конце').toBeLessThan(120);
  });
});
