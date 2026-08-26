import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { DEFAULT_MAX_FILE_SIZE_BYTES } from '@messenger/shared';
import { expect, test } from '@playwright/test';

import { registerUser, startPrivateChatWith, uniqueUser } from './helpers';

let dir = '';
let oversizeFile = '';

test.beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'qwill-oversize-'));
  oversizeFile = path.join(dir, 'oversize.mp4');
  await writeFile(oversizeFile, '');
  await truncate(oversizeFile, DEFAULT_MAX_FILE_SIZE_BYTES + 1024 * 1024);
});

test.afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('файл больше предела отвергается с внятной ошибкой', async ({ page, browser }) => {
  test.setTimeout(120_000);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const alice = uniqueUser('lima');
  const bob = uniqueUser('limb');

  const bobContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const bobPage = await bobContext.newPage();
  await registerUser(bobPage, bob);
  await bobContext.close();

  await registerUser(page, alice);
  await startPrivateChatWith(page, bob.username);

  await page.getByRole('button', { name: 'Прикрепить' }).click();
  await page.locator('input[type="file"]').setInputFiles(oversizeFile);

  await expect(page.getByText(/больше 2\.0 ГБ, отправить нельзя/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отправить' })).toHaveCount(0);

  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
});
