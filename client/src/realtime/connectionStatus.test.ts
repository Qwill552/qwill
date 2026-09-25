import { describe, expect, it } from 'vitest';

import { titleDelayMs, titleKindOf, trackUpdating, useConnectionStatus, type ConnectionStatus } from './connectionStatus';

const connected: ConnectionStatus = { online: true, socketConnected: true, ipBanned: false, updating: false };

describe('titleKindOf', () => {
  it('живое соединение без догоняния — знак «Qwill»', () => {
    expect(titleKindOf(connected)).toBe('brand');
  });

  it('догоняние после входа — «Обновление…»', () => {
    expect(titleKindOf({ ...connected, updating: true })).toBe('updating');
  });

  it('сокет не поднят — «Соединение…»', () => {
    expect(titleKindOf({ ...connected, socketConnected: false })).toBe('connecting');
  });

  it('нет сети главнее упавшего сокета', () => {
    expect(titleKindOf({ ...connected, online: false, socketConnected: false })).toBe('waiting');
  });

  it('блокировка по адресу главнее всего остального', () => {
    expect(titleKindOf({ online: false, socketConnected: false, ipBanned: true, updating: true })).toBe('ipBanned');
  });
});

describe('titleDelayMs', () => {
  it('короткие провалы соединения и обновления не мигают', () => {
    expect(titleDelayMs('connecting')).toBe(300);
    expect(titleDelayMs('updating')).toBe(300);
  });

  it('нет сети, блокировка и возврат к знаку — сразу', () => {
    expect(titleDelayMs('waiting')).toBe(0);
    expect(titleDelayMs('ipBanned')).toBe(0);
    expect(titleDelayMs('brand')).toBe(0);
  });
});

describe('trackUpdating', () => {
  it('держит признак обновления, пока идёт работа, и снимает его даже при отказе', async () => {
    let fail!: (error: Error) => void;
    const work = new Promise<void>((_, reject) => {
      fail = reject;
    });

    const tracked = trackUpdating(work);
    expect(useConnectionStatus.getState().updating).toBe(true);

    fail(new Error('сеть'));
    await expect(tracked).rejects.toThrow('сеть');
    expect(useConnectionStatus.getState().updating).toBe(false);
  });
});
