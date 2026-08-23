import { ChatWallpaper } from '../features/chat/ChatWallpaper';
import { EmptyState } from '../features/chats/EmptyState';
import styles from './EmptyChatColumn.module.css';

export function EmptyChatColumn() {
  return (
    <div className={styles.column}>
      <ChatWallpaper />
      <div className={styles.center}>
        <EmptyState
          title="Выберите чат"
          subtitle="Откройте переписку из списка слева"
          illustration={<div className={styles.logo} aria-hidden="true" />}
        />
      </div>
    </div>
  );
}
