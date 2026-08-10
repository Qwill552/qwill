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

export async function registerUser(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await page.getByPlaceholder('Имя пользователя (@username)').fill(user.username);
  await page.getByPlaceholder('Ваше имя').fill(user.displayName);
  await page.getByPlaceholder('Пароль').fill(user.password);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await page.waitForURL('**/chats');
  await expect(page.getByText('Qwill')).toBeVisible();
}

/** Открывает приватный чат: FAB «Написать» → «Найти человека» → поиск по имени → клик по результату. */
export async function startPrivateChatWith(page: Page, username: string): Promise<void> {
  await page.getByRole('button', { name: 'Написать' }).click();
  await page.getByRole('button', { name: 'Найти человека' }).click();
  await page.getByPlaceholder('Введите имя пользователя').fill(username);
  await page.getByText(`@${username}`).click();
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
