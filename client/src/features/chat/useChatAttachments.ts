import type { ChatAttachmentCategory, ChatAttachmentDto } from '@messenger/shared';
import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';

import { getChatAttachmentsRequest } from '../../api/chats';

const LOAD_AHEAD_PX = 600;

export interface PagedByMessage<T> {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  status: 'loading' | 'ready' | 'error';
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  retry: () => void;
}

export type UseChatAttachmentsResult = PagedByMessage<ChatAttachmentDto>;

export function usePagedByMessage<T extends { messageId: number }>(
  loadPage: (before?: number) => Promise<{ items: T[]; hasMore: boolean }>,
): PagedByMessage<T> {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const itemsRef = useRef<T[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  itemsRef.current = items;

  const load = useCallback(
    async (before?: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (before === undefined) setStatus('loading');
      try {
        const page = await loadPage(before);
        setItems((prev) => (before === undefined ? page.items : [...prev, ...page.items]));
        setHasMore(page.hasMore);
        setStatus('ready');
      } catch {
        setStatus('error');
      } finally {
        loadingRef.current = false;
      }
    },
    [loadPage],
  );

  useEffect(() => {
    setItems([]);
    setHasMore(true);
    void load();
  }, [load]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || status !== 'ready' || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const last = itemsRef.current.at(-1);
        if (last) void load(last.messageId);
      },
      { rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [status, hasMore, items.length, load]);

  return { items, setItems, status, hasMore, sentinelRef, retry: () => void load() };
}

export function useChatAttachments(chatId: string, category: ChatAttachmentCategory): UseChatAttachmentsResult {
  const loadPage = useCallback(
    (before?: number) => getChatAttachmentsRequest(chatId, category, before),
    [chatId, category],
  );
  return usePagedByMessage(loadPage);
}
