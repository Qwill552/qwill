import { ChatWallpaper } from '../features/chat/ChatWallpaper';
import { EmptyState } from '../features/chats/EmptyState';
import styles from './EmptyChatColumn.module.css';

const APP_LOGO_SRC = '/icon-192.png';

export function EmptyChatColumn() {
  return (
    <div className={styles.column}>
      <ChatWallpaper />
      <div className={styles.center}>
        <EmptyState
          title="Выберите чат"
          subtitle="Откройте переписку из списка слева"
          illustration={<img className={styles.logo} src={APP_LOGO_SRC} width={112} height={112} alt="" />}
        />
      </div>
    </div>
  );
}
