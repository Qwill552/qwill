import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Avatar } from '../features/chats/Avatar';
import { ChatList } from '../features/chats/ChatList';
import { EmptyState } from '../features/chats/EmptyState';
import { GroupPanel } from '../features/groups/GroupPanel';
import { MessageComposer, type ComposerContext } from '../features/messages/MessageComposer';
import { MessageList } from '../features/messages/MessageList';
import { ProfilePanel } from '../features/settings/ProfilePanel';
import { SettingsPanel } from '../features/settings/SettingsPanel';
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
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const [composerContext, setComposerContext] = useState<ComposerContext | null>(null);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

  const chats = useChatStore((s) => s.chats);
  const chatError = useChatStore((s) => s.chatError);
  const loadChats = useChatStore((s) => s.loadChats);
  const openChat = useChatStore((s) => s.openChat);
  const closeChat = useChatStore((s) => s.closeChat);
  const typingUsers = useChatStore((s) => (chatId ? s.typingByChat[chatId] : undefined)) ?? [];
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const kickedChatId = useChatStore((s) => s.kickedChatId);
  const clearKicked = useChatStore((s) => s.clearKicked);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!chatId) return;
    void openChat(chatId);
    return () => closeChat();
  }, [chatId, openChat, closeChat]);

  useEffect(() => {
    // Ответ/правка привязаны к открытому чату — при переходе в другой чат контекст неактуален.
    setComposerContext(null);
    setGroupPanelOpen(false);
  }, [chatId]);

  useEffect(() => {
    // Меня удалили из группы (или я вышел) — если это открытый чат, уходим из него (секция 8).
    if (!kickedChatId) return;
    if (kickedChatId === chatId) navigate('/chats', { replace: true });
    clearKicked();
  }, [kickedChatId, chatId, navigate, clearKicked]);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
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
              onClick={() => setProfilePanelOpen(true)}
              title="Профиль"
              aria-label="Профиль"
            >
              <Avatar label={user?.displayName ?? '?'} avatarUrl={user?.avatarUrl} size={40} />
            </button>
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
              onClick={() => setSettingsPanelOpen(true)}
              title="Настройки"
              aria-label="Настройки"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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

      {profilePanelOpen && <ProfilePanel onClose={() => setProfilePanelOpen(false)} />}
      {settingsPanelOpen && <SettingsPanel onClose={() => setSettingsPanelOpen(false)} />}

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
              <button
                className={styles.chatHeaderInfo}
                type="button"
                onClick={() => activeChat?.type === 'GROUP' && setGroupPanelOpen(true)}
                disabled={activeChat?.type !== 'GROUP'}
              >
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
              </button>
            </header>
            <MessageList
              chatId={chatId}
              onReply={(message) => setComposerContext({ mode: 'reply', message })}
              onEdit={(message) => setComposerContext({ mode: 'edit', message })}
            />
            <MessageComposer
              chatId={chatId}
              context={composerContext}
              onClearContext={() => setComposerContext(null)}
            />
            {groupPanelOpen && <GroupPanel chatId={chatId} onClose={() => setGroupPanelOpen(false)} />}
          </>
        )}
      </main>
    </div>
  );
}
