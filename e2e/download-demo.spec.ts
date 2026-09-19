import { expect, test, type Page } from '@playwright/test';

import { CONTENT } from '../client/src/pages/download/content';

interface DemoTestBridge {
  __downloadDemoTest(channel: string): { scenarioMs: number; deviation: number };
}

function readDemo(page: Page, channel: string) {
  return page.evaluate(
    (ch) => (window as unknown as DemoTestBridge).__downloadDemoTest(ch),
    channel,
  );
}

async function chatsListBox(page: Page) {
  const box = await page.locator('[class*="_list_"]').boundingBox();
  if (!box) throw new Error('лента чатов не найдена');
  return box;
}

test('таймлайн идёт сам по себе', async ({ page }) => {
  await page.goto('/download?os=android');
  const first = await readDemo(page, 'chatsScroll');
  await page.waitForTimeout(400);
  const second = await readDemo(page, 'chatsScroll');
  expect(second.scenarioMs).toBeGreaterThan(first.scenarioMs);
});

test('таймлайн не останавливается во время касания', async ({ page }) => {
  await page.goto('/download?os=android');
  const box = await chatsListBox(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 5 });
  const held1 = await readDemo(page, 'chatsScroll');
  await page.waitForTimeout(250);
  const held2 = await readDemo(page, 'chatsScroll');
  await page.mouse.up();

  expect(held2.scenarioMs).toBeGreaterThan(held1.scenarioMs);
});

test('после отпускания отклонение возвращается к цели', async ({ page }) => {
  await page.goto('/download?os=android');
  const box = await chatsListBox(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 80, { steps: 5 });
  const held = await readDemo(page, 'chatsScroll');
  expect(held.deviation).not.toBe(0);
  await page.mouse.up();

  await page.waitForTimeout(2500);
  const settled = await readDemo(page, 'chatsScroll');
  expect(settled.deviation).toBe(0);
});

test('пауза вне вьюпорта не съедает время, пока демо не видно', async ({ page }) => {
  await page.goto('/download?os=android');
  await page.waitForTimeout(200);
  const before = await readDemo(page, 'chatsScroll');

  await page.setViewportSize({ width: 420, height: 100 });
  await page.waitForTimeout(1200);
  const away = await readDemo(page, 'chatsScroll');

  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForTimeout(300);
  const back = await readDemo(page, 'chatsScroll');

  expect(away.scenarioMs - before.scenarioMs).toBeLessThan(400);
  expect(back.scenarioMs).toBeGreaterThan(away.scenarioMs);
});

test('переключатель сценария скрыт, пока показан только один сценарий', async ({ page }) => {
  await page.goto('/download?os=android');
  await expect(page.getByRole('button', { name: CONTENT.scenarioSwitch.label })).toHaveCount(0);
});
