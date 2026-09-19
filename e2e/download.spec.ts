import { expect, test, type Page } from '@playwright/test';

import { CONTENT } from '../client/src/pages/download/content';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

interface DemoTestBridge {
  __downloadDemoTest(channel: string): { scenarioMs: number; deviation: number };
}

function readDemo(page: Page, channel: string) {
  return page.evaluate(
    (ch) => (window as unknown as DemoTestBridge).__downloadDemoTest(ch),
    channel,
  );
}

test('страница /download открывается без входа', async ({ page }) => {
  await page.goto('/download?os=android');
  await expect(page.getByRole('heading', { level: 1, name: CONTENT.title })).toBeVisible();
});

test.describe('автоопределение ОС', () => {
  test.describe('пользователь на Android', () => {
    test.use({ userAgent: ANDROID_UA });

    test('без ?os= выбирается Android', async ({ page }) => {
      await page.goto('/download');
      await expect(page.getByRole('tab', { name: CONTENT.osSwitch.android })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    test('?os=windows важнее автоопределения', async ({ page }) => {
      await page.goto('/download?os=windows');
      await expect(page.getByRole('tab', { name: CONTENT.osSwitch.windows })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });

  test.describe('пользователь на Windows', () => {
    test.use({ userAgent: WINDOWS_UA });

    test('без ?os= выбирается Windows', async ({ page }) => {
      await page.goto('/download');
      await expect(page.getByRole('tab', { name: CONTENT.osSwitch.windows })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });
});

test('переключение ОС пишет адрес и не растит историю', async ({ page }) => {
  await page.goto('/download?os=android');
  const before = await page.evaluate(() => history.length);
  await page.getByRole('tab', { name: CONTENT.osSwitch.windows }).click();
  await expect(page).toHaveURL(/os=windows/);
  const after = await page.evaluate(() => history.length);
  expect(after).toBe(before);
});

test('кнопка скачивания ведёт на настоящий APK', async ({ page }) => {
  await page.goto('/download?os=android');
  const link = page.locator('a[download]');
  await expect(link).toHaveAttribute('href', /\/api\/app\/apk/);
});

test('кнопка скачивания ведёт на настоящий EXE', async ({ page }) => {
  await page.goto('/download?os=windows');
  const link = page.locator('a[download]');
  await expect(link).toHaveAttribute('href', /\.exe$/);
});

test('версия на кнопке живая', async ({ page, request }) => {
  await page.goto('/download?os=android');
  const api = await request.get('https://127.0.0.1:3000/api/app/version');
  const data = (await api.json()) as { versionName: string };
  await expect(page.locator('a[download]')).toContainText(data.versionName);
});

test('версия своя у каждой ОС', async ({ page }) => {
  await page.goto('/download?os=android');
  const link = page.locator('a[download]');
  await expect(link).not.toHaveText('');
  const androidText = await link.innerText();
  await page.getByRole('tab', { name: CONTENT.osSwitch.windows }).click();
  await expect(link).not.toHaveText(androidText);
});

test('патчноут раскрывается кликом', async ({ page }) => {
  await page.goto('/download?os=android');
  const toggle = page.getByRole('button', { name: new RegExp(CONTENT.releaseInfo.whatsNew) });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('li').first()).toBeVisible();
});

test('патчноут раскрывается с клавиатуры', async ({ page }) => {
  await page.goto('/download?os=android');
  const toggle = page.getByRole('button', { name: new RegExp(CONTENT.releaseInfo.whatsNew) });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('демо не ловит фокус клавиатурой', async ({ page }) => {
  await page.goto('/download?os=android');
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Tab');
    const insideHiddenDemo = await page.evaluate(
      () => document.activeElement?.closest('[aria-hidden="true"]') !== null,
    );
    expect(insideHiddenDemo).toBe(false);
  }
});

test('нет горизонтального скролла на узких и широких экранах', async ({ page }) => {
  await page.goto('/download?os=android');
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `ширина ${width}`).toBeLessThanOrEqual(0);
  }
});

test.describe('prefers-reduced-motion', () => {
  test('таймлайн стоит, прокрутка руками работает', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/download?os=android');
    const first = await readDemo(page, 'feedScroll');
    await page.waitForTimeout(400);
    const second = await readDemo(page, 'feedScroll');
    expect(second.scenarioMs).toBe(first.scenarioMs);

    const feed = page.locator('[class*="_feed_"]');
    const box = await feed.boundingBox();
    if (!box) throw new Error('лента переписки не найдена');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 60, { steps: 5 });
    const dragged = await readDemo(page, 'feedScroll');
    await page.mouse.up();
    expect(dragged.deviation).not.toBe(0);
  });
});

test('404 выпуска показывает условленное состояние, страница не падает', async ({ page }) => {
  await page.route('**/api/app/version', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/download?os=android');
  await expect(page.getByText(CONTENT.downloadButton.unavailable)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
