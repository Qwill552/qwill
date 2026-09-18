import { expect, test } from '@playwright/test';

import { messageRow, registerUser, sendMessage, startPrivateChatWith, uniqueUser } from './helpers';

const REACTION = '👍';

test('реакция переживает перезагрузку страницы', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const userA = uniqueUser('reactA');
    const userB = uniqueUser('reactB');

    await registerUser(pageA, userA);
    await registerUser(pageB, userB);

    await startPrivateChatWith(pageA, userB.username);
    const text = `Реакция ${Date.now()}`;
    await sendMessage(pageA, text);

    await messageRow(pageA, text).click({ button: 'right' });
    await pageA.getByRole('button', { name: `Отреагировать ${REACTION}` }).click();

    const chip = messageRow(pageA, text).getByRole('button', { name: new RegExp(REACTION) });
    await expect(chip).toBeVisible();

    await pageA.reload();

    await expect(messageRow(pageA, text)).toBeVisible();
    await expect(messageRow(pageA, text).getByRole('button', { name: new RegExp(REACTION) })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('реакция сразу после перезагрузки не теряется', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const userA = uniqueUser('raceA');
    const userB = uniqueUser('raceB');

    await registerUser(pageA, userA);
    await registerUser(pageB, userB);

    await startPrivateChatWith(pageA, userB.username);
    const text = `Гонка ${Date.now()}`;
    await sendMessage(pageA, text);

    await pageA.evaluate(() => localStorage.removeItem('messenger.accessToken'));
    await pageA.route('**/api/auth/refresh', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.continue();
    });
    await pageA.route('**/api/chats/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.continue();
    });

    await pageA.reload();

    await messageRow(pageA, text).click({ button: 'right' });
    await pageA.getByRole('button', { name: `Отреагировать ${REACTION}` }).click();

    await expect(messageRow(pageA, text).getByRole('button', { name: new RegExp(REACTION) })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
