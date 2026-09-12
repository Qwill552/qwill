import type { ChatAttachmentCategory, ChatAttachmentDto } from '@messenger/shared';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';

import { getChatAttachmentsRequest } from '../../api/chats';
import { scrollParentOf } from '../../ui/scrollParent';

const LOAD_AHEAD_PX = 600;

export interface PagedCursor {
  before?: number;
  after?: number;
}

export interface PagedPage<T> {
  items: T[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface PagedByMessage<T> {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  status: 'loading' | 'ready' | 'error';
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  /** Нижний страж — тянет более старое. */
  sentinelRef: RefObject<HTMLDivElement | null>;
  /** Верхний страж — тянет более новое, появляется только после прыжка в середину. */
  topSentinelRef: RefObject<HTMLDivElement | null>;
  jumpTo: (messageId: number) => Promise<void>;
  retry: () => void;
}

export type UseChatAttachmentsResult = PagedByMessage<ChatAttachmentDto>;

export function usePagedByMessage<T extends { messageId: number }>(
  loadPage: (cursor?: PagedCursor) => Promise<PagedPage<T>>,
): PagedByMessage<T> {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasMoreBefore, setHasMoreBefore] = useState(true);
  const [hasMoreAfter, setHasMoreAfter] = useState(false);
  const loadingRef = useRef(false);
  const itemsRef = useRef<T[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<{ scroller: Element; height: number; top: number } | null>(null);

  itemsRef.current = items;

  function holdScroll(): void {
    const scroller = scrollParentOf(topSentinelRef.current ?? sentinelRef.current);
    if (!scroller) return;
    keepRef.current = { scroller, height: scroller.scrollHeight, top: scroller.scrollTop };
  }

  useLayoutEffect(() => {
    const kept = keepRef.current;
    if (!kept) return;
    keepRef.current = null;
    kept.scroller.scrollTop = kept.top + (kept.scroller.scrollHeight - kept.height);
  }, [items]);

  const load = useCallback(
    async (cursor?: PagedCursor) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (cursor === undefined) setStatus('loading');
      try {
        const page = await loadPage(cursor);
        if (cursor?.after !== undefined) {
          holdScroll();
          setItems((prev) => [...page.items, ...prev]);
          setHasMoreAfter(page.hasMoreAfter);
        } else if (cursor?.before !== undefined) {
          setItems((prev) => [...prev, ...page.items]);
          setHasMoreBefore(page.hasMoreBefore);
        } else {
          setItems(page.items);
          setHasMoreBefore(page.hasMoreBefore);
          setHasMoreAfter(page.hasMoreAfter);
        }
        setStatus('ready');
      } catch {
        setStatus('error');
      } finally {
        loadingRef.current = false;
      }
    },
    [loadPage],
  );

  const jumpTo = useCallback(
    async (messageId: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        const [anchored, newer] = await Promise.all([
          loadPage({ before: messageId + 1 }),
          loadPage({ after: messageId }),
        ]);
        setItems([...newer.items, ...anchored.items]);
        setHasMoreBefore(anchored.hasMoreBefore);
        setHasMoreAfter(newer.hasMoreAfter);
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
    setHasMoreBefore(true);
    setHasMoreAfter(false);
    void load();
  }, [load]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || status !== 'ready' || !hasMoreBefore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const last = itemsRef.current.at(-1);
        if (last) void load({ before: last.messageId });
      },
      { root: scrollParentOf(sentinel), rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [status, hasMoreBefore, items.length, load]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || status !== 'ready' || !hasMoreAfter) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const first = itemsRef.current[0];
        if (first) void load({ after: first.messageId });
      },
      { root: scrollParentOf(sentinel), rootMargin: `${LOAD_AHEAD_PX}px 0px 0px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [status, hasMoreAfter, items.length, load]);

  return {
    items,
    setItems,
    status,
    hasMoreBefore,
    hasMoreAfter,
    sentinelRef,
    topSentinelRef,
    jumpTo,
    retry: () => void load(),
  };
}

export function useChatAttachments(chatId: string, category: ChatAttachmentCategory): UseChatAttachmentsResult {
  const loadPage = useCallback(
    (cursor?: PagedCursor) => getChatAttachmentsRequest(chatId, category, cursor),
    [chatId, category],
  );
  return usePagedByMessage(loadPage);
}
