import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { AppError } from '../src/lib/errors.js';
import { processImage } from '../src/lib/processImage.js';

const OPTIONS = { maxDimension: 2048, maxBytes: 5 * 1024 * 1024 };

function solidRaw(width: number, height: number, frames = 1): Buffer {
  const raw = Buffer.alloc(width * height * frames * 4);
  for (let frame = 0; frame < frames; frame++) {
    for (let pixel = 0; pixel < width * height; pixel++) {
      const offset = (frame * width * height + pixel) * 4;
      raw[offset] = (frame * 37) % 256;
      raw[offset + 1] = 90;
      raw[offset + 2] = 200;
      raw[offset + 3] = 255;
    }
  }
  return raw;
}

function makePng(width: number, height: number): Promise<Buffer> {
  return sharp(solidRaw(width, height), { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

function makeGif(width: number, height: number, frames: number, delay: number, loop: number): Promise<Buffer> {
  return sharp(solidRaw(width, height, frames), {
    raw: { width, height: height * frames, channels: 4, pageHeight: height },
  })
    .gif({ delay: Array.from({ length: frames }, () => delay), loop })
    .toBuffer();
}

async function expectRejected(input: Buffer): Promise<AppError> {
  try {
    await processImage(input, OPTIONS);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error('Ожидался отказ, но картинка была принята');
}

describe('конвейер обработки картинок (R-30C)', () => {
  it('перекодирует полиглот и выбрасывает дописанный в хвост HTML', async () => {
    const png = await makePng(32, 32);
    const polyglot = Buffer.concat([png, Buffer.from('<script>alert(1)</script><html>хвост</html>')]);

    const processed = await processImage(polyglot, OPTIONS);

    expect(processed.mime).toBe('image/png');
    expect(processed.data.includes(Buffer.from('<script>'))).toBe(false);
    expect(processed.data.includes(Buffer.from('хвост'))).toBe(false);
  });

  it('то же самое делает с GIF', async () => {
    const gif = await makeGif(24, 24, 3, 100, 0);
    const polyglot = Buffer.concat([gif, Buffer.from('<script>alert(1)</script>')]);

    const processed = await processImage(polyglot, OPTIONS);

    expect(processed.mime).toBe('image/gif');
    expect(processed.data.includes(Buffer.from('<script>'))).toBe(false);
  });

  it('отклоняет SVG — исполняемый код там часть спецификации', async () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
        '<script>alert(1)</script></svg>',
    );
    const error = await expectRejected(svg);
    expect(error.httpStatus).toBe(415);
  });

  it('отклоняет zip, переименованный в png', async () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(512)]);
    const error = await expectRejected(zip);
    expect(error.httpStatus).toBe(415);
  });

  it('не переносит EXIF: координаты съёмки не переживают загрузку', async () => {
    const withGps = await sharp(solidRaw(40, 40), { raw: { width: 40, height: 40, channels: 4 } })
      .withExif({ IFD0: { Copyright: 'Qwill' }, IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const processed = await processImage(withGps, OPTIONS);

    expect(processed.mime).toBe('image/jpeg');
    expect((await sharp(processed.data).metadata()).exif).toBeUndefined();
  });

  it('определяет тип по магическим байтам, а не по заявленному', async () => {
    const jpeg = await sharp(solidRaw(20, 20), { raw: { width: 20, height: 20, channels: 4 } })
      .jpeg()
      .toBuffer();

    const processed = await processImage(jpeg, OPTIONS);

    expect(processed.mime).toBe('image/jpeg');
    expect(processed.ext).toBe('jpg');
  });

  it('сохраняет анимацию, скорость и число повторов', async () => {
    const gif = await makeGif(20, 20, 5, 120, 3);

    const processed = await processImage(gif, OPTIONS);

    expect(processed.frames).toBe(5);
    const meta = await sharp(processed.data, { animated: true }).metadata();
    expect(meta.pages).toBe(5);
    expect(meta.delay).toEqual([120, 120, 120, 120, 120]);
    expect(meta.loop).toBe(3);
  });

  it('отклоняет гифку с числом кадров сверх предела, не разворачивая её в память', async () => {
    const bomb = await makeGif(4, 4, 400, 1, 0);

    const error = await expectRejected(bomb);

    expect(error.httpStatus).toBe(415);
    expect(error.message).toContain('Кадров');
  });

  it('отклоняет картинку со стороной больше 8000 px', async () => {
    const wide = await makePng(8001, 4);
    const error = await expectRejected(wide);
    expect(error.message).toContain('8000');
  });

  it('уменьшает длинную сторону до заданного предела и не растягивает мелкое', async () => {
    const large = await processImage(await makePng(1000, 500), { ...OPTIONS, maxDimension: 512 });
    expect(large.width).toBe(512);
    expect(large.height).toBe(256);

    const small = await processImage(await makePng(64, 32), { ...OPTIONS, maxDimension: 512 });
    expect(small.width).toBe(64);
    expect(small.height).toBe(32);
  });

  it('отклоняет тело больше разрешённого предела по байтам', async () => {
    const png = await makePng(8, 8);
    try {
      await processImage(png, { maxDimension: 512, maxBytes: png.length - 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).httpStatus).toBe(413);
      return;
    }
    throw new Error('Ожидался отказ по размеру тела');
  });
});
