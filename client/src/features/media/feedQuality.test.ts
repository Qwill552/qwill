import type { AttachmentDto, FileDto } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import { feedFileIdOf, feedUsesDownscaled, prefersOriginalInFeed, prefersThumbnailInFeed } from './feedQuality';

function file(id: string, mimeType: string, size: number): FileDto {
  return { id, mimeType, size, url: `/api/files/${id}` };
}

function attachment(overrides: Partial<AttachmentDto> & { file: FileDto }): AttachmentDto {
  return {
    id: 'a1',
    thumbnail: file('thumb', 'image/jpeg', 90_000),
    preview: file('prev', 'image/jpeg', 30_000),
    originalName: 'p.png',
    width: 4000,
    height: 3000,
    duration: null,
    peaks: null,
    blurhash: null,
    ...overrides,
  };
}

describe('prefersOriginalInFeed (R-33A)', () => {
  it('снимок меньше превью показывается оригиналом', () => {
    const small = attachment({ file: file('f', 'image/png', 40_000), width: 400, height: 300 });
    expect(prefersOriginalInFeed(small)).toBe(true);
    expect(feedFileIdOf(small)).toBe('f');
    expect(feedUsesDownscaled(small)).toBe(false);
  });

  it('скриншот — много пикселей, мало байт — тоже показывается оригиналом', () => {
    const shot = attachment({ file: file('f', 'image/png', 300_000), width: 1080, height: 2400 });
    expect(prefersOriginalInFeed(shot)).toBe(true);
  });

  it('тяжёлый снимок идёт через превью, как раньше', () => {
    const heavy = attachment({ file: file('f', 'image/jpeg', 3_000_000), width: 4000, height: 3000 });
    expect(prefersOriginalInFeed(heavy)).toBe(false);
    expect(feedFileIdOf(heavy)).toBe('prev');
    expect(feedUsesDownscaled(heavy)).toBe(true);
  });

  it('лёгкий по байтам, но огромный по пикселям — через превью: разбор кадра дороже сети', () => {
    const wide = attachment({ file: file('f', 'image/png', 200_000), width: 8000, height: 8000 });
    expect(prefersOriginalInFeed(wide)).toBe(false);
  });

  it('видео и голосовые правило не трогает', () => {
    const video = attachment({ file: file('f', 'video/mp4', 100_000), width: 320, height: 240 });
    expect(prefersOriginalInFeed(video)).toBe(false);

    const voice = attachment({ file: file('f', 'audio/ogg', 10_000), width: null, height: null, peaks: [0.2, 0.4] });
    expect(prefersOriginalInFeed(voice)).toBe(false);
  });

  it('GIF идёт своим путём и правилу не подчиняется', () => {
    const gif = attachment({ file: file('f', 'image/gif', 50_000), width: 200, height: 200 });
    expect(prefersOriginalInFeed(gif)).toBe(false);
  });

  it('без известных размеров правило не срабатывает', () => {
    const unknown = attachment({ file: file('f', 'image/jpeg', 50_000), width: null, height: null });
    expect(prefersOriginalInFeed(unknown)).toBe(false);
  });
});

describe('выбор копии по плотности экрана (R-33A)', () => {
  const screenshot = attachment({
    file: file('orig', 'image/png', 615_921),
    width: 1280,
    height: 2856,
    preview: file('prev', 'image/jpeg', 9_400),
    thumbnail: file('thumb', 'image/jpeg', 45_233),
  });

  it('на плотности 3 в ленту идёт миниатюра, а не превью в 512 px', () => {
    expect(prefersThumbnailInFeed(screenshot, 3)).toBe(true);
    expect(feedFileIdOf(screenshot, 3)).toBe('thumb');
  });

  it('на плотности 2 тоже: 640 настоящих пикселей превью уже не покрывает', () => {
    expect(feedFileIdOf(screenshot, 2)).toBe('thumb');
  });

  it('на обычном экране остаётся превью — там 512 px хватает', () => {
    expect(prefersThumbnailInFeed(screenshot, 1)).toBe(false);
    expect(feedFileIdOf(screenshot, 1)).toBe('prev');
  });

  it('маленький снимок по-прежнему идёт оригиналом при любой плотности', () => {
    const small = attachment({ file: file('f', 'image/png', 40_000), width: 400, height: 300 });
    expect(feedFileIdOf(small, 3)).toBe('f');
  });

  it('без миниатюры выбирать не из чего — остаётся превью', () => {
    const noThumb = attachment({ ...screenshot, thumbnail: null });
    expect(prefersThumbnailInFeed(noThumb, 3)).toBe(false);
    expect(feedFileIdOf(noThumb, 3)).toBe('prev');
  });

  it('голосовое правилу не подчиняется', () => {
    const voice = attachment({ file: file('f', 'audio/ogg', 10_000), width: null, height: null, peaks: [0.1] });
    expect(prefersThumbnailInFeed(voice, 3)).toBe(false);
  });
});

describe('копия выбирается по настоящей коробке (R-33A)', () => {
  const photo = attachment({
    file: file('orig', 'image/jpeg', 900_000),
    width: 3000,
    height: 2000,
    preview: file('prev', 'image/jpeg', 12_000),
    thumbnail: file('thumb', 'image/jpeg', 60_000),
  });

  it('плитка сетки медиа остаётся на превью — 128 px при плотности 3 это 384 настоящих', () => {
    expect(feedFileIdOf(photo, 3, 128)).toBe('prev');
  });

  it('пузырь в ленте берёт миниатюру — 256 px при плотности 3 это 768 настоящих', () => {
    expect(feedFileIdOf(photo, 3, 256)).toBe('thumb');
  });

  it('просмотрщик во весь экран тоже берёт миниатюру', () => {
    expect(feedFileIdOf(photo, 3, 420)).toBe('thumb');
  });
});
