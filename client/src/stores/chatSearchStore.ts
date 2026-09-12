import type { MessageDto } from '@messenger/shared';
import { create } from 'zustand';

import { searchInChatRequest } from '../api/chats';
import { isAbortError, NetworkError } from '../api/client';
import { cancelSearchJumps, jumpToSearchResult } from '../features/search/jumpToSearchResult';

export type ChatSearchMode = 'chat' | 'list';

interface ChatSearchState {
  open: boolean;
  chatId: string | null;
  draft: string;
  query: string;
  fromUserId: string | null;
  mode: ChatSearchMode;
  results: MessageDto[];
  total: number;
  hasMore: boolean;
  index: number;
  loading: boolean;
  error: string | null;
  openSearch: (chatId: string) => void;
  close: () => void;
  setDraft: (value: string) => void;
  submit: (options?: { jump?: boolean }) => void;
  setFrom: (userId: string | null) => void;
  setMode: (mode: ChatSearchMode) => void;
  next: () => void;
  prev: () => void;
  loadMore: () => void;
  selectResult: (index: number) => void;
}

const IDLE = {
  draft: '',
  query: '',
  fromUserId: null,
  mode: 'chat' as ChatSearchMode,
  results: [] as MessageDto[],
  total: 0,
  hasMore: false,
  index: 0,
  loading: false,
  error: null as string | null,
};

const SEARCH_FAILED = 'Не удалось выполнить поиск';
const JUMP_FAILED = 'Не удалось открыть сообщение';

let requestSeq = 0;
let controller: AbortController | null = null;
let loadingMore = false;

function abortPending(): void {
  requestSeq += 1;
  controller?.abort();
  controller = null;
  loadingMore = false;
  cancelSearchJumps();
}

export const useChatSearchStore = create<ChatSearchState>((set, get) => {
  async function jump(messageId: number): Promise<void> {
    const chatId = get().chatId;
    if (!chatId) return;
    const outcome = await jumpToSearchResult(chatId, messageId);
    if (outcome === 'failed') set({ error: JUMP_FAILED });
    else if (outcome === 'ok' && get().error === JUMP_FAILED) set({ error: null });
  }

  async function run(jumpToFirst: boolean): Promise<void> {
    const { chatId, draft, fromUserId } = get();
    if (!chatId) return;

    abortPending();
    const seq = requestSeq;
    const own = new AbortController();
    controller = own;
    set({ query: draft, loading: true, error: null });

    try {
      const page = await searchInChatRequest(chatId, draft.trim(), {
        fromUserId,
        signal: own.signal,
      });
      if (seq !== requestSeq) return;
      set({ results: page.messages, total: page.total, hasMore: page.hasMore, index: 0, loading: false });
      const first = page.messages[0];
      if (jumpToFirst && first) await jump(first.id);
    } catch (error) {
      if (isAbortError(error) || seq !== requestSeq) return;
      set({
        results: [],
        total: 0,
        hasMore: false,
        index: 0,
        loading: false,
        error: error instanceof NetworkError ? error.message : SEARCH_FAILED,
      });
    }
  }

  async function loadNextPage(): Promise<boolean> {
    const { chatId, query, fromUserId, results, hasMore } = get();
    const last = results[results.length - 1];
    if (!chatId || !hasMore || !last || loadingMore) return false;

    loadingMore = true;
    const seq = requestSeq;
    try {
      const page = await searchInChatRequest(chatId, query.trim(), { before: last.id, fromUserId });
      if (seq !== requestSeq) return false;
      set((state) => ({
        results: [...state.results, ...page.messages],
        hasMore: page.hasMore,
        total: page.total,
      }));
      return page.messages.length > 0;
    } catch {
      return false;
    } finally {
      loadingMore = false;
    }
  }

  return {
    open: false,
    chatId: null,
    ...IDLE,

    openSearch(chatId) {
      abortPending();
      set({ open: true, chatId, ...IDLE });
      void run(false);
    },

    close() {
      abortPending();
      set({ open: false, chatId: null, ...IDLE });
    },

    setDraft(value) {
      set({ draft: value });
    },

    submit(options) {
      void run(options?.jump !== false);
    },

    setFrom(userId) {
      set({ fromUserId: userId });
      void run(false);
    },

    setMode(mode) {
      set({ mode });
    },

    next() {
      const { results, index, hasMore } = get();
      if (results.length === 0) return;

      const ahead = results[index + 1];
      if (ahead) {
        set({ index: index + 1 });
        void jump(ahead.id);
        return;
      }
      if (!hasMore) return;

      void loadNextPage().then((grew) => {
        if (!grew) return;
        const state = get();
        const next = state.results[state.index + 1];
        if (!next) return;
        set({ index: state.index + 1 });
        void jump(next.id);
      });
    },

    prev() {
      const { results, index } = get();
      const back = index > 0 ? results[index - 1] : undefined;
      if (!back) return;
      set({ index: index - 1 });
      void jump(back.id);
    },

    loadMore() {
      void loadNextPage();
    },

    selectResult(index) {
      const target = get().results[index];
      if (!target) return;
      set({ index, mode: 'chat' });
      void jump(target.id);
    },
  };
});
