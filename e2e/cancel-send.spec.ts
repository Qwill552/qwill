import { expect, test } from '@playwright/test';

import { messageRow, registerUser, startPrivateChatWith, uniqueUser } from './helpers';

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const RECONNECT_GRACE_MS = 3000;

test.describe('R-20 отмена неотправленного', () => {
  test('правый клик по неотправленному открывает меню с отменой', async ({ page, context, browser }) => {
    const alice = uniqueUser('cancela');
    const bob = uniqueUser('cancelb');

    const bobContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const bobPage = await bobContext.newPage();
    await registerUser(bobPage, bob);
    await bobContext.close();

    await registerUser(page, alice);
    await startPrivateChatWith(page, bob.username);

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await context.setOffline(true);

    const input = page.getByRole('textbox', { name: 'Сообщение' });
    await input.fill('висит в очереди');
    await input.press('Enter');

    const row = messageRow(page, 'висит в очереди');
    await expect(row).toBeVisible();
    expect(Number(await row.getAttribute('data-message-id'))).toBeLessThan(0);

    await page.getByText('висит в очереди', { exact: true }).last().click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Отменить отправку' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Отменить отправку' }).click();

    await expect(page.getByText('висит в очереди', { exact: true })).toHaveCount(0);

    await context.setOffline(false);
    await page.waitForTimeout(RECONNECT_GRACE_MS);
    await expect(page.getByText('висит в очереди', { exact: true })).toHaveCount(0);
  });
});
