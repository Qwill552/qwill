import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test.use({ viewport: { width: 420, height: 908 }, deviceScaleFactor: 1, colorScheme: 'dark' });

interface Raw {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

async function decode(buf: Buffer): Promise<Raw> {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function rgb(raw: Raw, x: number, y: number): [number, number, number] {
  const i = (raw.width * y + x) * raw.channels;
  return [raw.data[i]!, raw.data[i + 1]!, raw.data[i + 2]!];
}

test('содержимое демо не вылезает на рамку телефона', async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto('/download?os=android');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.waitForTimeout(1300);

  const box = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('div')).find((node) =>
      node.className.includes('screenContent'),
    );
    if (!el) throw new Error('реплика не найдена');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  const leftRim = Math.floor(box.x);
  const rightRim = Math.floor(box.x + box.width);
  const corner = Math.round(56 * (box.width / 448)) + 10;
  const top = Math.round(box.y) + corner;
  const bottom = Math.round(box.y + box.height) - corner;

  let worst = 0;
  let where = '';

  for (let frame = 0; frame < 22; frame += 1) {
    const raw = await decode(await page.screenshot({ animations: 'allow' }));
    for (let y = top; y < bottom; y += 1) {
      for (const [rim, outside] of [
        [leftRim, leftRim - 1],
        [rightRim, rightRim + 1],
      ] as Array<[number, number]>) {
        const onRim = rgb(raw, rim, y);
        const bezel = rgb(raw, outside, y);
        const drift = Math.max(
          Math.abs(onRim[0] - bezel[0]),
          Math.abs(onRim[1] - bezel[1]),
          Math.abs(onRim[2] - bezel[2]),
        );
        if (drift > worst) {
          worst = drift;
          where = `строка ${y}, ${rim === leftRim ? 'слева' : 'справа'}: ${onRim} против рамки ${bezel}`;
        }
      }
    }
    await page.waitForTimeout(160);
  }

  expect(worst, `вылет на рамку: ${where}`).toBeLessThan(12);
});
