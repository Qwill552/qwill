import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { messageRow, registerUser, startPrivateChatWith, uniqueUser } from './helpers';
import type { TestUser } from './helpers';

/**
 * ЗВОНКИ-12. Покрывает жизненный цикл звонка через реальный LiveKit (self-hosted, см.
 * infra/livekit/README.md) — SFU-соединение и сокет-сигнализация настоящие, фейковые только
 * микрофон/камера браузера (флаги в playwright.config.ts). Таймаут неотвеченного звонка
 * (в проде 45с) переопределён на 3с для дев-сервера, поднятого под e2e — тоже в конфиге.
 */

const CALL_CONNECT_TIMEOUT_MS = 15_000;
const MISSED_CALL_WAIT_MS = 8_000;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function readRootEnvValue(key: string): string | null {
  let content: string;
  try {
    content = readFileSync(path.join(repoRoot, '.env'), 'utf8');
  } catch {
    return null;
  }
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(content);
  return match ? match[1].trim() : null;
}

function livekitHealthUrl(): string {
  const raw = readRootEnvValue('LIVEKIT_URL');
  if (!raw) throw new Error('LIVEKIT_URL не задан в .env — см. infra/livekit/README.md.');
  return raw.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

// Тесты ходят в настоящий LiveKit (правило шага). Без этой проверки недоступный сервер
// превращается в пять непонятных таймаутов на ожиданиях активного звонка вместо одной
// понятной ошибки в самом начале прогона.
test.beforeAll(async () => {
  const url = livekitHealthUrl();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`ответ ${response.status}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `LiveKit (${url}) недоступен: ${reason}. Проверьте LIVEKIT_URL в .env и что сервер поднят — см. infra/livekit/README.md.`,
      { cause: error },
    );
  }
});

interface CallPeers {
  contextA: BrowserContext;
  contextB: BrowserContext;
  pageA: Page;
  pageB: Page;
  userA: TestUser;
  userB: TestUser;
}

async function setupCallPeers(browser: Browser, labelA: string, labelB: string): Promise<CallPeers> {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const userA = uniqueUser(labelA);
  const userB = uniqueUser(labelB);

  await registerUser(pageA, userA);
  await registerUser(pageB, userB);
  await startPrivateChatWith(pageA, userB.username);

  return { contextA, contextB, pageA, pageB, userA, userB };
}

/** A звонит, B принимает, оба доезжают до активного звонка (таймер mm:ss на обоих экранах). */
async function establishActiveCall(pageA: Page, pageB: Page): Promise<void> {
  await pageA.getByRole('button', { name: 'Позвонить' }).click();
  await expect(pageB.getByRole('alert')).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
  await pageB.getByRole('button', { name: 'Принять звонок' }).click();
  await expect(pageA.getByText(/^\d{2}:\d{2}$/)).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
  await expect(pageB.getByText(/^\d{2}:\d{2}$/)).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
}

test('звонок устанавливается: исходящий у A, входящий у B, после принятия оба видят активный звонок', async ({ browser }) => {
  const { contextA, contextB, pageA, pageB, userA } = await setupCallPeers(browser, 'estA', 'estB');

  try {
    await pageA.getByRole('button', { name: 'Позвонить' }).click();
    await expect(pageA.getByText(/Звоним…|Соединяем…/)).toBeVisible();

    await expect(pageB.getByRole('alert')).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
    await expect(pageB.getByText('Входящий звонок…')).toBeVisible();
    await expect(pageB.getByText(userA.displayName)).toBeVisible();

    await pageB.getByRole('button', { name: 'Принять звонок' }).click();

    await expect(pageA.getByText(/^\d{2}:\d{2}$/)).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
    await expect(pageB.getByText(/^\d{2}:\d{2}$/)).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
    await expect(pageB.getByText(userA.displayName)).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('отклонение закрывает звонок у обоих и оставляет в ленте запись о звонке', async ({ browser }) => {
  const { contextA, contextB, pageA, pageB, userA } = await setupCallPeers(browser, 'declA', 'declB');

  try {
    await pageA.getByRole('button', { name: 'Позвонить' }).click();
    await expect(pageB.getByRole('alert')).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });

    await pageB.getByRole('button', { name: 'Отклонить звонок' }).click();

    await expect(pageA.getByText('Звонок отклонён')).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
    await expect(pageB.getByRole('alert')).toHaveCount(0);

    await expect(messageRow(pageA, 'Звонок отклонён')).toBeVisible();

    // B ни разу не открывал чат с A — заходит в него сейчас, чат уже виден в списке
    // без перезагрузки (тот же механизм, что в messenger.spec.ts).
    await pageB.locator('nav').getByText(userA.displayName).click();
    await expect(messageRow(pageB, 'Отклонённый звонок')).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('неотвеченный звонок сам становится пропущенным и оставляет запись в ленте', async ({ browser }) => {
  const { contextA, contextB, pageA, pageB, userA } = await setupCallPeers(browser, 'missA', 'missB');

  try {
    await pageA.getByRole('button', { name: 'Позвонить' }).click();
    await expect(pageB.getByRole('alert')).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });

    // Никто не отвечает — сервер сам завершает звонок через CALL_MISSED_TIMEOUT_MS
    // (3с на дев-сервере под e2e, см. playwright.config.ts).
    await expect(pageA.getByText('Не отвечает')).toBeVisible({ timeout: MISSED_CALL_WAIT_MS });
    await expect(pageB.getByRole('alert')).toHaveCount(0, { timeout: MISSED_CALL_WAIT_MS });

    await expect(messageRow(pageA, 'Звонок без ответа')).toBeVisible();

    await pageB.locator('nav').getByText(userA.displayName).click();
    await expect(messageRow(pageB, 'Пропущенный звонок')).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('завершение одним участником закрывает звонок у второго', async ({ browser }) => {
  const { contextA, contextB, pageA, pageB } = await setupCallPeers(browser, 'endA', 'endB');

  try {
    await establishActiveCall(pageA, pageB);

    await pageB.getByRole('button', { name: 'Завершить звонок' }).click();

    await expect(pageA.getByText('Звонок завершён')).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('запись о звонке в ленте появляется ровно одна', async ({ browser }) => {
  const { contextA, contextB, pageA, pageB, userA } = await setupCallPeers(browser, 'logA', 'logB');

  try {
    await establishActiveCall(pageA, pageB);

    await pageA.getByRole('button', { name: 'Завершить звонок' }).click();

    await expect(messageRow(pageA, 'Исходящий звонок')).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
    await expect(messageRow(pageA, 'Исходящий звонок')).toHaveCount(1);

    await pageB.locator('nav').getByText(userA.displayName).click();
    await expect(messageRow(pageB, 'Входящий звонок')).toBeVisible({ timeout: CALL_CONNECT_TIMEOUT_MS });
    await expect(messageRow(pageB, 'Входящий звонок')).toHaveCount(1);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
