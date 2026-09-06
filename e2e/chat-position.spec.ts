import { expect, test, type Page } from '@playwright/test';

import { registerUser, uniqueUser } from './helpers';
import { prisma } from '../server/src/db/prisma.js';

const SEED_COUNT = 600;
const SCROLL_UP_PX = 2400;

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

test('чат открывается там же, где его оставили, и не мигает хвостом (КЭШ-17)', async ({ page }) => {
  test.setTimeout(180_000);

  const me = uniqueUser('posmine');
  const other = uniqueUser('posother');
  await registerUser(page, me);

  const mine = await prisma.user.findUniqueOrThrow({ where: { username: me.username } });
  const peer = await prisma.user.create({
    data: { username: other.username, displayName: other.displayName, passwordHash: 'e2e-not-a-real-hash' },
  });
  const chat = await prisma.chat.create({
    data: {
      type: 'PRIVATE',
      pairKey: [mine.id, peer.id].sort().join(':'),
      members: { create: [{ userId: mine.id }, { userId: peer.id }] },
    },
  });
  await prisma.message.createMany({
    data: Array.from({ length: SEED_COUNT }, (_, index) => ({
      chatId: chat.id,
      senderId: index % 2 === 0 ? peer.id : mine.id,
      content: `строка номер ${index + 1}`,
    })),
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

  await page.goto(`/chats/${chat.id}`);
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
    await page.locator(`a[href="/chats/${chat.id}"], [data-chat-id="${chat.id}"]`).first().click();
    await page.waitForURL(`**/chats/${chat.id}`);

    let closestToBottom = Number.POSITIVE_INFINITY;
    let view = before;
    for (let step = 0; step < 20; step += 1) {
      view = await feedView(page);
      if (view.anchorId !== null) closestToBottom = Math.min(closestToBottom, view.distanceToBottom);
      await page.waitForTimeout(120);
    }

    expect(view.anchorId, `цикл ${cycle}: вернулись не к тому сообщению`).toBe(before.anchorId);
    expect(Math.abs(view.anchorTop - before.anchorTop), `цикл ${cycle}: место сместилось`).toBeLessThan(8);
    expect(closestToBottom, `цикл ${cycle}: лента на входе сорвалась в хвост`).toBeGreaterThan(600);
  }
});
