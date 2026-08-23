import { useRef, useState, type ReactNode } from 'react';

import { useRecentSearchStore, type RecentSearchEntry } from '../../stores/recentSearchStore';
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
  children: ReactNode;
  onOpen: () => void;
  onForgetRequest: (anchor: DOMRect) => void;
}

function RecentItem({ className, children, onOpen, onForgetRequest }: RecentItemProps) {
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
      className={className}
      onClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault();
        onForgetRequest(event.currentTarget.getBoundingClientRect());
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
  const [forgetTarget, setForgetTarget] = useState<{ chatId: string; anchor: DOMRect } | null>(null);

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
        colorKey={entry.chatId}
      />
    );
  }

  return (
    <div className={styles.wrap}>
      {people.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Недавние</h2>
          <div className={`${styles.people} hide-native-scrollbar`}>
            {people.map((entry) => (
              <RecentItem
                key={entry.chatId}
                className={styles.person}
                onOpen={() => onOpenChat(entry.chatId)}
                onForgetRequest={(anchor) => setForgetTarget({ chatId: entry.chatId, anchor })}
              >
                {avatarOf(entry, 54)}
                <span className={styles.personName}>{entry.title}</span>
              </RecentItem>
            ))}
          </div>
        </section>
      )}

      {chats.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Недавние чаты</h2>
          {chats.map((entry) => (
            <RecentItem
              key={entry.chatId}
              className={styles.row}
              onOpen={() => onOpenChat(entry.chatId)}
              onForgetRequest={(anchor) => setForgetTarget({ chatId: entry.chatId, anchor })}
            >
              {avatarOf(entry, 44)}
              <span className={styles.rowName}>
                {entry.title}
                {entry.isService && <OfficialMark size={14} />}
              </span>
            </RecentItem>
          ))}
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
              onSelect: () => forget(forgetTarget.chatId),
            },
          ]}
        />
      )}
    </div>
  );
}
