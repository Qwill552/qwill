import { LINK_PREVIEW_MAX_URLS, type LinkPreviewDto } from '@messenger/shared';
import { create } from 'zustand';

import { getLinkPreviewsRequest } from '../api/links';

const FLUSH_DELAY_MS = 60;
const RETRY_DELAYS_MS = [2000, 5000];

interface LinkPreviewState {
  previews: Record<string, LinkPreviewDto>;
  request: (url: string) => void;
  prime: (preview: LinkPreviewDto) => void;
}

const queue = new Set<string>();
const attemptsByUrl = new Map<string, number>();
let flushTimer: number | undefined;

export const useLinkPreviewStore = create<LinkPreviewState>((set) => ({
  previews: {},

  request(url) {
    if (attemptsByUrl.has(url)) return;
    attemptsByUrl.set(url, 0);
    enqueue(url);
  },

  prime(preview) {
    attemptsByUrl.set(preview.url, RETRY_DELAYS_MS.length + 1);
    set((state) => (state.previews[preview.url] ? state : { previews: { ...state.previews, [preview.url]: preview } }));
  },
}));

function enqueue(url: string): void {
  queue.add(url);
  if (flushTimer !== undefined) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void flush();
  }, FLUSH_DELAY_MS);
}

async function flush(): Promise<void> {
  const batch = [...queue].slice(0, LINK_PREVIEW_MAX_URLS);
  if (batch.length === 0) return;
  for (const url of batch) queue.delete(url);

  let previews: LinkPreviewDto[];
  try {
    previews = (await getLinkPreviewsRequest(batch)).previews;
  } catch {
    return;
  } finally {
    if (queue.size > 0 && flushTimer === undefined) {
      flushTimer = window.setTimeout(() => {
        flushTimer = undefined;
        void flush();
      }, FLUSH_DELAY_MS);
    }
  }

  useLinkPreviewStore.setState((state) => {
    const next = { ...state.previews };
    for (const preview of previews) next[preview.url] = preview;
    return { previews: next };
  });

  for (const preview of previews) {
    if (preview.status !== 'pending') continue;
    const attempt = attemptsByUrl.get(preview.url) ?? 0;
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) continue;
    attemptsByUrl.set(preview.url, attempt + 1);
    window.setTimeout(() => enqueue(preview.url), delay);
  }
}

export function resetLinkPreviewCache(): void {
  queue.clear();
  attemptsByUrl.clear();
  if (flushTimer !== undefined) window.clearTimeout(flushTimer);
  flushTimer = undefined;
  useLinkPreviewStore.setState({ previews: {} });
}
