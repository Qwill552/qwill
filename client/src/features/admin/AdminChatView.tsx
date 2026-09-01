import type { AdminChatDto, MessageDto } from '@messenger/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getAdminChatMessagesRequest, getAdminChatRequest } from '../../api/admin';
import { useLayoutMode } from '../../app/useLayoutMode';
import { Avatar } from '../../ui/Avatar';
import { ChromeBar } from '../../ui/chrome/ChromeBar';
import { GlassButton } from '../../ui/chrome/GlassButton';
import { GlassPill } from '../../ui/chrome/GlassPill';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import { setReadOnlyMediaSource } from '../media/mediaViewerStore';
import { DateDivider } from '../messages/Dividers';
import { MessageBubble } from '../messages/MessageBubble';
import styles from './AdminChatView.module.css';

const HEADER_STYLE = {
  padding: 'calc(6px + var(--safe-top)) calc(12px + var(--safe-right)) 10px calc(12px + var(--safe-left))',
  gap: '9px',
};

const DESKTOP_HEADER_STYLE = {
  padding: '0 16px',
  gap: '12px',
  height: '60px',
};

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function startsSeries(message: MessageDto, previous: MessageDto | undefined): boolean {
  if (!previous) return true;
  if (previous.sender?.id !== message.sender?.id) return true;
  return new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_WINDOW_MS;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось открыть переписку';
}

export function AdminChatView() {
  const navigate = useNavigate();
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId ?? '';
  const isDesktop = useLayoutMode() === 'desktop';

  const listRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<MessageDto[]>([]);
  const settledRef = useRef(false);

  const [chat, setChat] = useState<AdminChatDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  messagesRef.current = messages;

  useEffect(() => {
    if (!chatId) return;
    return setReadOnlyMediaSource(chatId, () => messagesRef.current);
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    let alive = true;

    Promise.all([getAdminChatRequest(chatId), getAdminChatMessagesRequest(chatId)])
      .then(([loadedChat, page]) => {
        if (!alive) return;
        setChat(loadedChat);
        setMessages(page.messages);
        setHasMore(page.hasMore);
      })
      .catch((err: unknown) => {
        if (alive) setError(errorText(err));
      });

    return () => {
      alive = false;
    };
  }, [chatId]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || settledRef.current || messages.length === 0) return;
    settledRef.current = true;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  const loadOlder = useCallback(() => {
    const oldest = messages[0];
    if (!chatId || !oldest || loadingMore) return;

    const list = listRef.current;
    const anchor = list ? list.scrollHeight - list.scrollTop : 0;

    setLoadingMore(true);
    getAdminChatMessagesRequest(chatId, oldest.id)
      .then((page) => {
        setMessages((current) => [...page.messages, ...current]);
        setHasMore(page.hasMore);
        requestAnimationFrame(() => {
          if (list) list.scrollTop = list.scrollHeight - anchor;
        });
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setLoadingMore(false));
  }, [chatId, messages, loadingMore]);

  const reported = new Set(chat?.reportedMessageIds ?? []);

  return (
    <div className={styles.screen}>
      <div
        ref={listRef}
        className={`${styles.list} hide-native-scrollbar`}
        onScroll={(event) => {
          if (hasMore && !loadingMore && event.currentTarget.scrollTop < 200) loadOlder();
        }}
      >
        <ScrollIndicator target={listRef} />

        {error && <p className={styles.error}>{error}</p>}

        {hasMore && (
          <button type="button" className={styles.loadMore} disabled={loadingMore} onClick={loadOlder}>
            {loadingMore ? 'Загружаю…' : 'Ещё выше'}
          </button>
        )}
        {!hasMore && messages.length > 0 && <p className={styles.start}>Начало переписки</p>}

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const showDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
          const seriesStart = startsSeries(message, previous);
          const next = messages[index + 1];
          const seriesEnd = !next || startsSeries(next, message);

          return (
            <div key={message.id}>
              {showDay && <DateDivider iso={message.createdAt} />}
              <div className={`${styles.row} ${reported.has(message.id) ? styles.reported : ''}`}>
                <span className={styles.avatarSlot}>
                  {seriesEnd && message.sender && (
                    <Avatar
                      label={message.sender.displayName}
                      avatarUrl={message.sender.avatarUrl}
                      color={message.sender.avatarColor}
                      colorKey={message.sender.id}
                      size={32}
                    />
                  )}
                </span>
                <MessageBubble message={message} own={false} read={false} showAuthor={seriesStart} />
              </div>
            </div>
          );
        })}
      </div>

      <ChromeBar variant={isDesktop ? 'solid' : 'chrome'} style={isDesktop ? DESKTOP_HEADER_STYLE : HEADER_STYLE}>
        <GlassButton icon="back" label="Назад к жалобам" onClick={() => navigate('/admin')} />
        <GlassPill
          variant={isDesktop ? 'flat' : 'cap'}
          title={chat?.title ?? '…'}
          subtitle="Режим чтения"
          leading={
            <Avatar
              label={chat?.title ?? '?'}
              avatarUrl={chat?.avatarUrl}
              size={40}
              colorKey={chatId}
            />
          }
        />
      </ChromeBar>
    </div>
  );
}
