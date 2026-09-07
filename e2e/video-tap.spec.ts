import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { registerUser, startPrivateChatWith, uniqueUser } from './helpers';

let dir = '';
let clip = '';

async function recordClip(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const parts: Blob[] = [];
    recorder.ondataavailable = (event) => parts.push(event.data);

    let frame = 0;
    const timer = setInterval(() => {
      frame += 1;
      ctx.fillStyle = `hsl(${(frame * 11) % 360} 70% 50%)`;
      ctx.fillRect(0, 0, 320, 240);
    }, 40);

    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    recorder.stop();
    await new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    clearInterval(timer);

    const bytes = new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
}

test.afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

test('тап по видео в просмотрщике запускает и останавливает воспроизведение', async ({ page, browser }) => {
  test.setTimeout(180_000);

  await page.goto('/');
  const encoded = await recordClip(page);
  dir = await mkdtemp(path.join(tmpdir(), 'qwill-clip-'));
  clip = path.join(dir, 'clip.webm');
  await writeFile(clip, Buffer.from(encoded, 'base64'));

  const alice = uniqueUser('vida');
  const bob = uniqueUser('vidb');

  const bobContext = await browser.newContext({ ignoreHTTPSErrors: true });
  await registerUser(await bobContext.newPage(), bob);
  await bobContext.close();

  await registerUser(page, alice);
  await startPrivateChatWith(page, bob.username);

  await page.getByRole('button', { name: 'Прикрепить' }).click();
  await page.locator('input[type="file"]').setInputFiles(clip);
  await page.getByRole('button', { name: 'Отправить' }).click();

  const tile = page.locator('[data-media-tile="true"]').last();
  await expect(tile).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await tile.click();

  const viewer = page.getByRole('dialog', { name: 'Просмотр медиа' });
  await expect(viewer).toBeVisible();

  const video = viewer.locator('video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);

  const box = (await video.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(false);

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true);
});
