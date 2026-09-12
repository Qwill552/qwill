import { useState } from 'react';

import { useChatStore } from '../../stores/chatStore';
import { GlassPill } from '../../ui/chrome/GlassPill';
import { Icon } from '../../ui/Icon';
import styles from './BlockedBar.module.css';

interface BlockedBarProps {
  chatId: string;
  userId: string | null;
  iBlocked: boolean;
}

const BLOCKER_TEXT = { title: 'Опп устранен', note: 'вы заблокировали данного пользователя' };
const BLOCKED_TEXT = { title: 'Вы заблокированы', note: 'Мы не ведем переговоры с оппами.' };

export function BlockedBar({ chatId, userId, iBlocked }: BlockedBarProps) {
  const setUserBlocked = useChatStore((s) => s.setUserBlocked);
  const [pending, setPending] = useState(false);

  const text = iBlocked ? BLOCKER_TEXT : BLOCKED_TEXT;

  function handleUnblock(): void {
    if (!userId || pending) return;
    setPending(true);
    setUserBlocked(chatId, userId, false)
      .catch(() => undefined)
      .finally(() => setPending(false));
  }

  return (
    <GlassPill
      className={styles.bar}
      leading={<Icon name="lock" size={20} className={styles.icon} />}
      title={text.title}
      subtitle={text.note}
      trailing={
        iBlocked && userId ? (
          <button type="button" className={styles.action} onClick={handleUnblock} disabled={pending}>
            Разблокировать
          </button>
        ) : undefined
      }
    />
  );
}
