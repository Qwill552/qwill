import { expect, type Locator, type Page } from '@playwright/test';

export interface TestUser {
  username: string;
  displayName: string;
  password: string;
}

let counter = 0;

/**
 * Уникальный пользователь на каждый вызов. username должен пройти серверную схему
 * (только [a-z0-9_], 3–32 символа) — см. shared/src/constants.ts.
 */
export function uniqueUser(label: string): TestUser {
  counter += 1;
  const suffix = `${Date.now().toString(36)}${counter}`;
  return {
    username: `e2e${label}${suffix}`.toLowerCase().slice(0, 32),
    displayName: `E2E ${label} ${counter}`,
    password: 'Password123',
  };
}

export async function letFormClicksThroughAuthClouds(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '[aria-hidden="true"][class*="cloud"] { pointer-events: none !important; }',
  });
}

/** Регистрация ограничена десятью попытками в минуту на адрес (`authLimiter`), и в dev эта
 *  защита включена — а прогон нескольких спек подряд её выбирает. Раньше это выглядело как
 *  зависший `waitForURL` и читалось как поломка самой ленты: отсюда явная проверка ответа. */
export async function registerUser(page: Page, user: TestUser): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    await page.goto('/login');
    await letFormClicksThroughAuthClouds(page);
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await page.getByPlaceholder('Имя пользователя (@username)').fill(user.username);
    await page.getByPlaceholder('Ваше имя').fill(user.displayName);
    await page.getByPlaceholder('Пароль').fill(user.password);

    const answer = page
      .waitForResponse((response) => response.url().includes('/api/auth/register'), { timeout: 20_000 })
      .catch(() => null);
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
    const response = await answer;
    if (response === null || response.status() !== 429) break;

    const reset = Number(response.headers()['ratelimit-reset'] ?? '60');
    const waitSeconds = Number.isFinite(reset) ? reset : 60;
    if (attempt >= 1 || waitSeconds > 20) {
      throw new Error(
        `Регистрация отбита лимитом 10/мин на адрес (authLimiter, включён вне NODE_ENV=test). ` +
          `Это ограничение приложения, а не поломка теста: гоняйте спеки по одной или подождите ${waitSeconds} с.`,
      );
    }
    await page.waitForTimeout((waitSeconds + 1) * 1000);
  }

  await page.waitForURL('**/chats');
  await expect(page.getByText('Qwill')).toBeVisible();
}

/** Открывает приватный чат: строка поиска в шапке → единый поиск → клик по результату. */
export async function startPrivateChatWith(page: Page, username: string): Promise<void> {
  await page.getByRole('button', { name: 'Поиск чатов и людей' }).click();
  await page.getByRole('textbox', { name: 'Поиск чатов и людей' }).fill(username);
  await page.getByRole('button', { name: new RegExp(username) }).first().click();
  await page.waitForURL(/\/chats\/.+/);
}

/** Печатает и отправляет сообщение через Enter, дожидаясь появления пузыря у отправителя. */
export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Сообщение' });
  await input.fill(text);
  await input.press('Enter');
  await expect(page.getByText(text, { exact: true }).last()).toBeVisible();
}

/** Строка сообщения в ленте — глобальный класс .message-wrap задан явно в MessageList.tsx. */
export function messageRow(page: Page, text: string): Locator {
  return page.locator('.message-wrap', { hasText: text });
}
