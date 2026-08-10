import { expect, test } from '@playwright/test';

import { messageRow, registerUser, sendMessage, startPrivateChatWith, uniqueUser } from './helpers';

test('сообщение, написанное офлайн, переживает перезагрузку и доходит один раз', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const userA = uniqueUser('offlineA');
    const userB = uniqueUser('offlineB');

    await registerUser(pageA, userA);
    await registerUser(pageB, userB);

    await startPrivateChatWith(pageA, userB.username);
    await sendMessage(pageA, 'первое онлайн');
    await expect(messageRow(pageA, 'первое онлайн')).toBeVisible();

    await contextA.setOffline(true);
    await sendMessage(pageA, 'написано офлайн');
    await expect(messageRow(pageA, 'написано офлайн')).toBeVisible();

    await pageA.reload();
    await expect(messageRow(pageA, 'написано офлайн')).toBeVisible();

    await contextA.setOffline(false);
    await pageA.evaluate(() => window.dispatchEvent(new Event('online')));

    await startPrivateChatWith(pageB, userA.username);
    await expect(messageRow(pageB, 'написано офлайн')).toHaveCount(1, { timeout: 15_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('история чата читается без сети после перезагрузки', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const userA = uniqueUser('cacheA');
    const userB = uniqueUser('cacheB');

    await registerUser(pageA, userA);
    await registerUser(pageB, userB);

    await startPrivateChatWith(pageA, userB.username);
    await sendMessage(pageA, 'сообщение для кэша');
    await expect(messageRow(pageA, 'сообщение для кэша')).toBeVisible();

    await contextA.setOffline(true);
    await pageA.reload();

    await expect(messageRow(pageA, 'сообщение для кэша')).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
