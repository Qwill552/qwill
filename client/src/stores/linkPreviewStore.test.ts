import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetLinkPreviewCache, useLinkPreviewStore } from './linkPreviewStore';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('../api/links', () => ({ getLinkPreviewsRequest: requestMock }));

describe('linkPreviewStore (PM-9)', () => {
  beforeEach(() => {
    resetLinkPreviewCache();
    requestMock.mockReset();
    requestMock.mockResolvedValue({ previews: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('один и тот же URL из двух мест уходит на сервер один раз', async () => {
    const { request } = useLinkPreviewStore.getState();
    request('https://example.test/a');
    request('https://example.test/a');
    await vi.advanceTimersByTimeAsync(500);

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(['https://example.test/a']);
  });

  it('пачка не превышает 20 адресов, остаток уходит следующей', async () => {
    const { request } = useLinkPreviewStore.getState();
    for (let i = 0; i < 25; i += 1) request(`https://example.test/${i}`);
    await vi.advanceTimersByTimeAsync(500);

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock.mock.calls[0]?.[0]).toHaveLength(20);
    expect(requestMock.mock.calls[1]?.[0]).toHaveLength(5);
  });

  it('готовое превью из вкладки не порождает запроса', async () => {
    const { prime, request } = useLinkPreviewStore.getState();
    prime({
      url: 'https://example.test/ready',
      status: 'ready',
      siteName: 'Example',
      title: 'Заголовок',
      description: null,
      imageUrl: null,
    });
    request('https://example.test/ready');
    await vi.advanceTimersByTimeAsync(500);

    expect(requestMock).not.toHaveBeenCalled();
    expect(useLinkPreviewStore.getState().previews['https://example.test/ready']?.title).toBe('Заголовок');
  });
});
