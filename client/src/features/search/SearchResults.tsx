import type { ChatSearchResult, SearchResultsDto, UserSearchResult } from '@messenger/shared';
import { useEffect, useState, type ReactNode } from 'react';

import { isAbortError, NetworkError } from '../../api/client';
import { searchRequest } from '../../api/search';
import { useChatStore } from '../../stores/chatStore';
import { useRecentSearchStore } from '../../stores/recentSearchStore';
import { Avatar } from '../../ui/Avatar';
import { formatLastSeen } from '../../utils/presence';
import { OfficialMark } from '../chat/OfficialMark';
import { SERVICE_AVATAR_SRC } from '../chat/serviceChat';
import { EmptyState } from '../chats/EmptyState';
import styles from './SearchResults.module.css';

const DEBOUNCE_MS = 250;
const WORD_BOUNDARY = /[\s_.@-]/;

interface SearchResultsProps {
  query: string;
  onOpenChat: (chatId: string) => void;
}

export function highlight(text: string, needle: string): ReactNode {
  if (needle.length === 0) return text;

  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = haystack.indexOf(target);

  while (at !== -1) {
    if (at === 0 || WORD_BOUNDARY.test(text[at - 1] ?? '')) {
      if (at > from) parts.push(text.slice(from, at));
      parts.push(
        <mark key={at} className={styles.hit}>
          {text.slice(at, at + needle.length)}
        </mark>,
      );
      from = at + needle.length;
    }
    at = haystack.indexOf(target, at + 1);
  }
  if (parts.length === 0) return text;
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

export function SearchResults({ query, onOpenChat }: SearchResultsProps) {
  const startPrivateChat = useChatStore((s) => s.startPrivateChat);
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const remember = useRecentSearchStore((s) => s.remember);

  const [results, setResults] = useState<SearchResultsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const trimmed = query.trim();
  const needle = (trimmed.startsWith('@') ? trimmed.slice(1) : trimmed).trim();

  useEffect(() => {
    if (trimmed.length === 0) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      searchRequest(trimmed, controller.signal)
        .then((data) => {
          setResults(data);
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
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, retry]);

  function openChat(chat: ChatSearchResult): void {
    remember({
      chatId: chat.id,
      kind: 'chat',
      title: chat.title,
      username: null,
      avatarUrl: chat.avatarUrl,
      avatarColor: chat.avatarColor,
      type: chat.type,
      isService: chat.isService,
    });
    onOpenChat(chat.id);
  }

  async function openUser(user: UserSearchResult): Promise<void> {
    setOpeningId(user.id);
    setError(null);
    try {
      const chat = await startPrivateChat(user.username);
      remember({
        chatId: chat.id,
        kind: 'user',
        title: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        avatarColor: user.avatarColor,
        type: 'PRIVATE',
        isService: false,
      });
      onOpenChat(chat.id);
    } catch {
      setError('Не удалось начать чат');
      setOpeningId(null);
    }
  }

  function statusOf(user: UserSearchResult): { text: string; online: boolean } {
    const presence = presenceByUser[user.id];
    if (presence?.online) return { text: 'в сети', online: true };
    return { text: formatLastSeen(presence?.lastSeenAt ?? user.lastSeenAt), online: false };
  }

  if (error) {
    return (
      <div className={styles.state}>
        <p className={styles.errorText}>{error}</p>
        <button type="button" className={styles.retry} onClick={() => setRetry((value) => value + 1)}>
          Повторить
        </button>
      </div>
    );
  }

  if (!results) {
    return loading ? <p className={styles.hint}>Ищу…</p> : null;
  }

  if (results.chats.length === 0 && results.users.length === 0) {
    return <EmptyState title="Ничего не нашлось" subtitle="Попробуйте другой запрос" />;
  }

  return (
    <div className={styles.list}>
      {results.chats.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Чаты</h2>
          {results.chats.map((chat) => (
            <button key={chat.id} type="button" className={styles.row} onClick={() => openChat(chat)}>
              <Avatar
                label={chat.title}
                avatarUrl={chat.avatarUrl}
                imageSrc={chat.isService ? SERVICE_AVATAR_SRC : undefined}
                size={44}
                color={chat.avatarColor ?? undefined}
                colorKey={chat.id}
              />
              <span className={styles.body}>
                <span className={styles.name}>
                  <span className={styles.nameText}>{highlight(chat.title, needle)}</span>
                  {chat.isService && <OfficialMark size={14} />}
                </span>
                {chat.lastMessagePreview && <span className={styles.meta}>{chat.lastMessagePreview}</span>}
              </span>
            </button>
          ))}
        </section>
      )}

      {results.users.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Глобальный поиск</h2>
          {results.users.map((user) => {
            const status = statusOf(user);
            return (
              <button
                key={user.id}
                type="button"
                className={styles.row}
                disabled={openingId === user.id}
                onClick={() => void openUser(user)}
              >
                <Avatar label={user.displayName} avatarUrl={user.avatarUrl} size={44} color={user.avatarColor} />
                <span className={styles.body}>
                  <span className={styles.name}>
                    <span className={styles.nameText}>{highlight(user.displayName, needle)}</span>
                  </span>
                  <span className={styles.meta}>
                    <span className={styles.username}>@{highlight(user.username, needle)}</span>
                    <span className={status.online ? styles.online : undefined}>{status.text}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      )}

      {loading && <p className={styles.hint}>Ищу…</p>}
    </div>
  );
}
