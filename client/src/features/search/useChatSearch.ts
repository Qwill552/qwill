import type { MessageDto } from '@messenger/shared';
import { useEffect, useRef, useState } from 'react';

import { searchInChatRequest } from '../../api/chats';
import { isAbortError, NetworkError } from '../../api/client';

const DEBOUNCE_MS = 250;

export interface ChatSearchState {
  query: string;
  setQuery: (value: string) => void;
  messages: MessageDto[];
  total: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  /** Позиция текущего совпадения среди messages — индекс, а не id, потому что счётчик
   *  «3 из 17» на десктопе считает от начала списка (сверху вниз, от новых к старым). */
  activeIndex: number;
  activeMessageId: number | null;
  goNext: () => void;
  goPrev: () => void;
}

/** Общий хук для обоих видов поиска внутри чата (мобильный список и десктопные стрелки,
 *  R-33) — различие только в отрисовке, логика запроса и текущей позиции одна на двоих. */
export function useChatSearch(chatId: string | undefined): ChatSearchState {
  const [query, setQueryState] = useState('');
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const loadingMoreRef = useRef(false);
  const advanceOnLoadRef = useRef(false);

  function setQuery(value: string): void {
    setQueryState(value);
    setActiveIndex(0);
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (!chatId || trimmed.length === 0) {
      setMessages([]);
      setTotal(0);
      setHasMore(false);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    advanceOnLoadRef.current = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchInChatRequest(chatId, trimmed, undefined, controller.signal)
        .then((page) => {
          setMessages(page.messages);
          setTotal(page.total);
          setHasMore(page.hasMore);
          setActiveIndex(0);
          setError(null);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (isAbortError(err)) return;
          setError(err instanceof NetworkError ? err.message : 'Не удалось выполнить поиск');
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [chatId, query]);

  function loadMore(): void {
    const trimmed = query.trim();
    const last = messages[messages.length - 1];
    if (!chatId || trimmed.length === 0 || !hasMore || !last || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    searchInChatRequest(chatId, trimmed, last.id)
      .then((page) => {
        setMessages((prev) => [...prev, ...page.messages]);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        advanceOnLoadRef.current = false;
      })
      .finally(() => {
        loadingMoreRef.current = false;
      });
  }

  useEffect(() => {
    if (!advanceOnLoadRef.current) return;
    advanceOnLoadRef.current = false;
    setActiveIndex((index) => Math.min(index + 1, messages.length - 1));
  }, [messages]);

  function goNext(): void {
    if (messages.length === 0) return;
    if (activeIndex + 1 < messages.length) {
      setActiveIndex(activeIndex + 1);
      return;
    }
    if (hasMore) {
      advanceOnLoadRef.current = true;
      loadMore();
    } else {
      setActiveIndex(0);
    }
  }

  function goPrev(): void {
    if (messages.length === 0) return;
    setActiveIndex((index) => (index === 0 ? messages.length - 1 : index - 1));
  }

  return {
    query,
    setQuery,
    messages,
    total,
    loading,
    error,
    hasMore,
    loadMore,
    activeIndex,
    activeMessageId: messages[activeIndex]?.id ?? null,
    goNext,
    goPrev,
  };
}
