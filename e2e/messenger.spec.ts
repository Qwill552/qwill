import { expect, test } from '@playwright/test';

import { messageRow, registerUser, sendMessage, startPrivateChatWith, uniqueUser } from './helpers';

/**
 * Этап 10-A. Базовые E2E-сценарии на реальном dev-стеке (см. playwright.config.ts: webServer
 * поднимает `npm run dev`). Реплика двух пользователей всегда идёт через два изолированных
 * browser-контекста — refresh-кука общая на origin одной вкладки/профиля (см. память
 * messenger-two-account-browser-testing), а разные BrowserContext её не делят.
 *
 * Заменяет legacy/tests/smoke.js: тот бил по старому REST/socket API (server.js), здесь то же
 * "регистрация → чат → сообщение" проверяется через текущий UI и текущие контракты.
 */

test('регистрация → вход → перезагрузка не выбрасывает на /login', async ({ page }) => {
  const user = uniqueUser('reg');
  await registerUser(page, user);

  await page.reload();

  await expect(page).toHaveURL(/\/chats/);
  await expect(page.getByText('Qwill').first()).toBeVisible();
});

test('переписка двух пользователей в реальном времени', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const userA = uniqueUser('chatA');
    const userB = uniqueUser('chatB');

    await registerUser(pageA, userA);
    await registerUser(pageB, userB);

    await startPrivateChatWith(pageA, userB.username);
    await sendMessage(pageA, `Привет, ${userB.displayName}!`);

    // Чат и сообщение появляются у B сами — без обновления страницы (chat:created + message:new).
    await pageB.locator('nav').getByText(userA.displayName).click();
    await expect(pageB.getByText(`Привет, ${userB.displayName}!`)).toBeVisible();

    await sendMessage(pageB, 'Привет в ответ!');
    await expect(pageA.locator('main').getByText('Привет в ответ!')).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('отправка файла → прогресс → файл виден собеседнику', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const userA = uniqueUser('fileA');
    const userB = uniqueUser('fileB');

    await registerUser(pageA, userA);
    await registerUser(pageB, userB);

    await startPrivateChatWith(pageA, userB.username);

    const fileInput = pageA.locator('input[type="file"]');
    const fileChosen = fileInput.setInputFiles({
      name: 'e2e-note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Тестовый файл для проверки отправки вложений (этап 10-A).'),
    });

    // Пока идёт превью/загрузка, композер показывает имя файла и полосу прогресса —
    // на маленьком файле окно очень короткое, поэтому не требуем застать именно этот момент,
    // а проверяем сквозной результат: вложение доехало до собеседника.
    await fileChosen;

    await pageB.locator('nav').getByText(userA.displayName).click();
    await expect(pageB.getByText('e2e-note.txt')).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByText('e2e-note.txt')).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('реакция и ответ на сообщение', async ({ browser }) => {
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
    const original = 'Оригинальное сообщение для реакции и ответа';
    await sendMessage(pageA, original);

    await pageB.locator('nav').getByText(userA.displayName).click();
    const rowOnB = messageRow(pageB, original);
    await rowOnB.hover();
    await rowOnB.getByRole('button', { name: 'Реакция' }).click();
    await rowOnB.getByRole('button', { name: '👍' }).click();

    // Реакция видна автору исходного сообщения без перезагрузки (message:reaction).
    await expect(messageRow(pageA, original).getByText('👍')).toBeVisible();

    await rowOnB.hover();
    await rowOnB.getByRole('button', { name: 'Ответить' }).click();
    const reply = 'Ответ на оригинальное сообщение';
    await sendMessage(pageB, reply);

    // В ответе — цитата с именем автора оригинала (A), сама цитата и новый текст видны у A.
    const replyRowOnA = messageRow(pageA, reply);
    await expect(replyRowOnA.getByText(userA.displayName)).toBeVisible();
    await expect(replyRowOnA.getByText(original)).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('создание группы → добавление участника → выход участника', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const contextC = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();

  try {
    const userA = uniqueUser('groupA');
    const userB = uniqueUser('groupB');
    const userC = uniqueUser('groupC');

    await registerUser(pageA, userA);
    await registerUser(pageB, userB);
    await registerUser(pageC, userC);

    const groupTitle = `E2E группа ${Date.now().toString(36)}`;

    await pageA.getByRole('button', { name: '+ Новая группа' }).click();
    const createModal = pageA.getByRole('dialog', { name: 'Новая группа' });
    await createModal.locator('#group-title').fill(groupTitle);
    await createModal.locator('#group-username').fill(userB.username);
    await createModal.getByRole('button', { name: 'Добавить' }).click();
    await createModal.getByRole('button', { name: 'Создать группу' }).click();

    await expect(pageA).toHaveURL(/\/chats\/.+/);
    const groupHeaderButtonA = pageA.getByRole('button', { name: groupTitle });
    await expect(groupHeaderButtonA).toBeVisible();

    // B был приглашён при создании — видит группу в реальном времени, без перезагрузки.
    await expect(pageB.locator('nav').getByText(groupTitle)).toBeVisible({ timeout: 10_000 });

    await groupHeaderButtonA.click();
    const groupPanelA = pageA.getByRole('dialog', { name: 'Информация о группе' });
    await groupPanelA.getByPlaceholder('@username').fill(userC.username);
    await groupPanelA.getByRole('button', { name: 'Добавить' }).click();
    await expect(groupPanelA.getByText(userC.displayName)).toBeVisible();

    // C добавлена тем же путём после создания — тоже видит группу без перезагрузки.
    await expect(pageC.locator('nav').getByText(groupTitle)).toBeVisible({ timeout: 10_000 });

    await pageC.locator('nav').getByText(groupTitle).click();
    await pageC.getByRole('button', { name: groupTitle }).click();
    const groupPanelC = pageC.getByRole('dialog', { name: 'Информация о группе' });
    // Кнопка выхода требует повторного клика-подтверждения; текст между кликами меняется
    // ("Покинуть группу" → "Точно покинуть группу?"), поэтому матчим по общей части текста.
    const leaveButton = groupPanelC.locator('button').filter({ hasText: 'группу' });
    await leaveButton.click();
    await leaveButton.click();

    await expect(pageC.locator('nav').getByText(groupTitle)).toHaveCount(0);
    // Остальные участники видят, что C вышла, без перезагрузки (member:changed → left).
    await expect(groupPanelA.getByText(userC.displayName)).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
    await contextC.close();
  }
});
