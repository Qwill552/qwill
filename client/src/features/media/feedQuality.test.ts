import type { AttachmentDto, FileDto } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import { feedFileIdOf, feedUsesDownscaled, prefersOriginalInFeed } from './feedQuality';

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
