import { AVATAR_MIME_TYPES } from '@messenger/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { setAvatarRequest } from '../api/auth';
import { uploadFile } from '../api/files';
import { Avatar } from '../features/chats/Avatar';
import { ChatList } from '../features/chats/ChatList';
import { EmptyState } from '../features/chats/EmptyState';
import { MessageComposer } from '../features/messages/MessageComposer';
import { MessageList } from '../features/messages/MessageList';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useUiStore } from '../stores/uiStore';
import styles from './MessengerPage.module.css';

function formatLastSeen(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  return `был(а) в сети ${day} в ${time}`;
}

/** Ядро чатов + прочтение/счётчики/presence + мобильный layout и темы (секция 10, этапы 2–4). */
export function MessengerPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const chats = useChatStore((s) => s.chats);
  const chatError = useChatStore((s) => s.chatError);
  const loadChats = useChatStore((s) => s.loadChats);
  const openChat = useChatStore((s) => s.openChat);
  const closeChat = useChatStore((s) => s.closeChat);
  const typingUsers = useChatStore((s) => (chatId ? s.typingByChat[chatId] : undefined)) ?? [];
  const presenceByUser = useChatStore((s) => s.presenceByUser);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!chatId) return;
    void openChat(chatId);
    return () => closeChat();
  }, [chatId, openChat, closeChat]);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setAvatarUploading(true);
    try {
      const uploaded = await uploadFile(file, 'avatar');
      updateUser(await setAvatarRequest(uploaded.id, uploaded.sha256));
    } catch {
      // Полноценный профиль/настройки — отдельный этап; здесь достаточно тихо не сломать интерфейс.
    } finally {
      setAvatarUploading(false);
    }
  }

  const activeChat = chats.find((c) => c.id === chatId);
  const otherOnline = activeChat?.otherMember
    ? (presenceByUser[activeChat.otherMember.id]?.online ?? false)
    : false;

  let subtitle: string | null = null;
  if (typingUsers.length > 0) {
    subtitle =
      activeChat?.type === 'GROUP' ? `${typingUsers.map((u) => u.displayName).join(', ')} печатает…` : 'печатает…';
  } else if (activeChat?.type === 'PRIVATE' && activeChat.otherMember) {
    const presence = presenceByUser[activeChat.otherMember.id];
    subtitle = presence?.online ? 'в сети' : formatLastSeen(presence?.lastSeenAt ?? activeChat.otherMember.lastSeenAt);
  }

  return (
    <div className={`${styles.page} ${chatId ? styles.showChat : styles.showList}`}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.me}>
            <button
              className={styles.avatarButton}
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              title="Сменить аватар"
              aria-label="Сменить аватар"
            >
              <Avatar label={user?.displayName ?? '?'} avatarUrl={user?.avatarUrl} size={40} />
            </button>
            <input
              ref={avatarInputRef}
              className={styles.hiddenInput}
              type="file"
              accept={AVATAR_MIME_TYPES.join(',')}
              onChange={(e) => void handleAvatarChange(e)}
            />
            <span className={styles.meName}>{user?.displayName}</span>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.iconButton}
              type="button"
              onClick={toggleTheme}
              title="Сменить тему"
              aria-label="Сменить тему"
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => void handleLogout()}
              title="Выйти"
              aria-label="Выйти"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 12h11m0 0-3-3m3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <ChatList />
      </aside>

      <main className={styles.main}>
        {!chatId && (
          <div className={styles.emptyWrap}>
            <EmptyState title="Выберите чат" subtitle="Или начните новый — введите @username слева" />
          </div>
        )}

        {chatId && chatError && (
          <div className={styles.emptyWrap}>
            <EmptyState title={chatError} />
          </div>
        )}

        {chatId && !chatError && (
          <>
            <header className={styles.chatHeader}>
              <button
                className={styles.backButton}
                type="button"
                onClick={() => navigate('/chats')}
                aria-label="Назад к чатам"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M15 5 8 12l7 7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <Avatar label={activeChat?.title ?? '?'} avatarUrl={activeChat?.avatarUrl} size={40} online={otherOnline} />
              <div className={styles.chatHeaderText}>
                <span className={styles.chatTitle}>{activeChat?.title ?? '…'}</span>
                {subtitle && (
                  <span
                    className={`${styles.chatSubtitle} ${typingUsers.length > 0 ? styles.chatSubtitleTyping : ''}`}
                  >
                    {subtitle}
                  </span>
                )}
              </div>
            </header>
            <MessageList chatId={chatId} />
            <MessageComposer chatId={chatId} />
          </>
        )}
      </main>
    </div>
  );
}
