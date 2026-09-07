import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRiskyFileName, isRiskyWarningMuted, muteRiskyWarning } from './riskyFile';

describe('riskyFile (КЭШ-21a)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('узнаёт расширение независимо от регистра', () => {
    expect(isRiskyFileName('setup.exe')).toBe(true);
    expect(isRiskyFileName('SETUP.EXE')).toBe(true);
    expect(isRiskyFileName('Отчёт.Ps1')).toBe(true);
  });

  it('смотрит на последнюю точку', () => {
    expect(isRiskyFileName('archive.tar.gz')).toBe(false);
    expect(isRiskyFileName('archive.gz.exe')).toBe(true);
    expect(isRiskyFileName('exe.pdf')).toBe(false);
  });

  it('имя без точки рискованным не считается', () => {
    expect(isRiskyFileName('exe')).toBe(false);
    expect(isRiskyFileName('README')).toBe(false);
    expect(isRiskyFileName('.exe')).toBe(false);
  });

  it('обычные вложения проходят', () => {
    expect(isRiskyFileName('фото.jpg')).toBe(false);
    expect(isRiskyFileName('договор.pdf')).toBe(false);
    expect(isRiskyFileName('кино.mkv')).toBe(false);
  });

  it('флаг «больше не спрашивать» переживает повторное чтение', () => {
    expect(isRiskyWarningMuted()).toBe(false);
    muteRiskyWarning();
    expect(isRiskyWarningMuted()).toBe(true);
  });

  it('недоступный localStorage не роняет проверку', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('доступ запрещён');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('доступ запрещён');
    });

    expect(isRiskyWarningMuted()).toBe(false);
    expect(() => muteRiskyWarning()).not.toThrow();
  });
});
