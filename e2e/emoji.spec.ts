import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  letFormClicksThroughAuthClouds,
  startPrivateChatWith,
  uniqueUser,
  type TestUser,
} from './helpers';

async function registerUserForEmojiTest(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await letFormClicksThroughAuthClouds(page);
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await page.getByPlaceholder('Имя пользователя (@username)').fill(user.username);
  await page.getByPlaceholder('Ваше имя').fill(user.displayName);
  await page.getByPlaceholder('Пароль').fill(user.password);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await page.waitForURL('**/chats');
  await expect(page.getByRole('button', { name: 'Написать' })).toBeVisible();
}

test('эмодзи в отправленном сообщении рендерится спрайтом у обоих собеседников', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const userA = uniqueUser('emojiA');
    const userB = uniqueUser('emojiB');

    await registerUserForEmojiTest(pageA, userA);
    await registerUserForEmojiTest(pageB, userB);

    await startPrivateChatWith(pageA, userB.username);

    const field = pageA.getByRole('textbox', { name: 'Сообщение' });
    await field.fill('привет 😀');
    await field.press('Enter');

    const sentRowOnA = pageA.locator('.message-wrap', { hasText: 'привет' }).last();
    await expect(sentRowOnA).toBeVisible();
    await expect(sentRowOnA.locator('span[style*="sheet.webp"]')).toBeVisible();

    await pageB.locator('nav').getByText(userA.displayName).click();
    const sentRowOnB = pageB.locator('.message-wrap', { hasText: 'привет' }).last();
    await expect(sentRowOnB).toBeVisible();
    await expect(sentRowOnB.locator('span[style*="sheet.webp"]')).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('эмодзи в превью списка чатов и в плашке ответа рендерится спрайтом', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const userA = uniqueUser('previewA');
    const userB = uniqueUser('previewB');

    await registerUserForEmojiTest(pageA, userA);
    await registerUserForEmojiTest(pageB, userB);

    await startPrivateChatWith(pageA, userB.username);

    const message = 'до 😀 после';
    const fieldA = pageA.getByRole('textbox', { name: 'Сообщение' });
    await fieldA.fill(message);
    await fieldA.press('Enter');

    const sentRowOnA = pageA.locator('.message-wrap', { hasText: 'до' }).last();
    await expect(sentRowOnA).toBeVisible();
    await expect(sentRowOnA.locator('span[style*="sheet.webp"]')).toBeVisible();

    const chatRowOnB = pageB.locator('nav').locator('a', { hasText: userA.displayName });
    await expect(chatRowOnB.locator('span[style*="sheet.webp"]')).toBeVisible({ timeout: 10_000 });

    const messageRow = pageA.locator('.message-wrap', { hasText: 'до' });
    await messageRow.click();
    await pageA.getByRole('menuitem', { name: 'Ответить' }).click();

    const contextBar = pageA.locator('div').filter({ hasText: 'Ответ' }).last();
    await expect(contextBar.locator('span[style*="sheet.webp"]')).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
