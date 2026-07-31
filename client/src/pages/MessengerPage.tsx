import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Avatar } from '../ui/Avatar';
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
import { IconButton } from '../ui/IconButton';
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
            <IconButton
              icon={theme === 'dark' ? 'moon' : 'sun'}
              size={18}
              label="Сменить тему"
              onClick={toggleTheme}
            />
            <IconButton
              icon="settings"
              size={18}
              label="Настройки"
              onClick={() => setSettingsPanelOpen(true)}
            />
            <IconButton
              icon="logout"
              size={18}
              label="Выйти"
              onClick={() => void handleLogout()}
            />
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
              <IconButton
                className={styles.backButton}
                icon="back"
                size={20}
                label="Назад к чатам"
                variant="plain"
                onClick={() => navigate('/chats')}
              />
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
