import { useRef, useState, type ReactNode } from 'react';

import { useChatStore } from '../../stores/chatStore';
import { recentSearchKey, useRecentSearchStore, type RecentSearchEntry } from '../../stores/recentSearchStore';
import { Avatar } from '../../ui/Avatar';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { haptic } from '../../ui/haptic';
import { Menu } from '../../ui/Menu';
import { OfficialMark } from '../chat/OfficialMark';
import { SERVICE_AVATAR_SRC } from '../chat/serviceChat';
import { EmptyState } from '../chats/EmptyState';
import styles from './RecentSearches.module.css';

interface RecentSearchesProps {
  onOpenChat: (chatId: string) => void;
}

interface RecentItemProps {
  className: string | undefined;
  popping: boolean;
  children: ReactNode;
  onOpen: () => void;
  onForgetRequest: (anchor: DOMRect) => void;
  onPopEnd: () => void;
}

function RecentItem({ className, popping, children, onOpen, onForgetRequest, onPopEnd }: RecentItemProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const longPress = useLongPress({
    onLongPress: () => {
      const anchor = buttonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      haptic();
      onForgetRequest(anchor);
    },
  });

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${className ?? ''} ${popping ? styles.popping : ''}`}
      onClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault();
        onForgetRequest(event.currentTarget.getBoundingClientRect());
      }}
      onAnimationEnd={(event) => {
        if (popping && event.target === event.currentTarget) onPopEnd();
      }}
      {...longPress}
    >
      {children}
    </button>
  );
}

export function RecentSearches({ onOpenChat }: RecentSearchesProps) {
  const entries = useRecentSearchStore((s) => s.entries);
  const forget = useRecentSearchStore((s) => s.forget);
  const startPrivateChat = useChatStore((s) => s.startPrivateChat);
  const [forgetTarget, setForgetTarget] = useState<{ key: string; anchor: DOMRect } | null>(null);
  const [popping, setPopping] = useState<string | null>(null);

  const people = entries.filter((entry) => entry.kind === 'user');
  const chats = entries.filter((entry) => entry.kind === 'chat');

  if (entries.length === 0) {
    return <EmptyState title="Напиши что-то, чтобы я мог это найти" />;
  }

  function avatarOf(entry: RecentSearchEntry, size: number) {
    return (
      <Avatar
        label={entry.title}
        avatarUrl={entry.avatarUrl}
        imageSrc={entry.isService ? SERVICE_AVATAR_SRC : undefined}
        size={size}
        color={entry.avatarColor ?? undefined}
        colorKey={recentSearchKey(entry)}
      />
    );
  }

  function openPerson(entry: RecentSearchEntry): void {
    if (!entry.username) return;
    void startPrivateChat(entry.username)
      .then((chat) => onOpenChat(chat.id))
      .catch(() => undefined);
  }

  return (
    <div className={styles.wrap}>
      {people.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Недавние</h2>
          <div className={`${styles.people} hide-native-scrollbar`}>
            {people.map((entry) => {
              const key = recentSearchKey(entry);
              return (
                <RecentItem
                  key={key}
                  className={styles.person}
                  popping={popping === key}
                  onOpen={() => openPerson(entry)}
                  onForgetRequest={(anchor) => setForgetTarget({ key, anchor })}
                  onPopEnd={() => {
                    setPopping(null);
                    forget(key);
                  }}
                >
                  {avatarOf(entry, 54)}
                  <span className={styles.personName}>{entry.title}</span>
                </RecentItem>
              );
            })}
          </div>
        </section>
      )}

      {chats.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Недавние чаты</h2>
          {chats.map((entry) => {
            const key = recentSearchKey(entry);
            const chatId = entry.chatId;
            if (!chatId) return null;
            return (
              <RecentItem
                key={key}
                className={styles.row}
                popping={popping === key}
                onOpen={() => onOpenChat(chatId)}
                onForgetRequest={(anchor) => setForgetTarget({ key, anchor })}
                onPopEnd={() => {
                  setPopping(null);
                  forget(key);
                }}
              >
                {avatarOf(entry, 44)}
                <span className={styles.rowName}>
                  {entry.title}
                  {entry.isService && <OfficialMark size={14} />}
                </span>
              </RecentItem>
            );
          })}
        </section>
      )}

      {forgetTarget && (
        <Menu
          anchor={forgetTarget.anchor}
          onClose={() => setForgetTarget(null)}
          items={[
            {
              id: 'forget',
              label: 'Убрать из недавних',
              icon: 'trash',
              danger: true,
              onSelect: () => setPopping(forgetTarget.key),
            },
          ]}
        />
      )}
    </div>
  );
}
