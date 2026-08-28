import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCardDraft, readCardDraft, writeCardDraft } from './cardDraft';

describe('черновик визитки', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('без черновика возвращает null', () => {
    expect(readCardDraft('u1')).toBeNull();
  });

  it('возвращает записанное тем же пользователем', () => {
    writeCardDraft('u1', '<h1>Привет</h1>');
    expect(readCardDraft('u1')).toBe('<h1>Привет</h1>');
  });

  it('черновики разных пользователей не пересекаются', () => {
    writeCardDraft('u1', '<p>первый</p>');
    writeCardDraft('u2', '<p>второй</p>');

    expect(readCardDraft('u1')).toBe('<p>первый</p>');
    expect(readCardDraft('u2')).toBe('<p>второй</p>');

    clearCardDraft('u1');
    expect(readCardDraft('u1')).toBeNull();
    expect(readCardDraft('u2')).toBe('<p>второй</p>');
  });

  it('переполненное хранилище не роняет экран', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => writeCardDraft('u1', '<p>не влезет</p>')).not.toThrow();
  });

  it('недоступное хранилище читается как пустое', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    expect(readCardDraft('u1')).toBeNull();
  });
});
