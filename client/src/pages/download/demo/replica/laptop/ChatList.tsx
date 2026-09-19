import { Icon } from '../../../../../ui/Icon';
import { Avatar, Badge, cx, OfficialMark, SearchGlyph } from '../phone/Chrome';
import {
  CHAT_FILTERS,
  CHAT_ROWS,
  DESKTOP_TEXT,
  PRESS,
  type ReplicaState,
  type ScreenSurface,
} from '../phone/demoData';
import { Cursor, Fab, IconBtn } from './Chrome';
import styles from './ChatList.module.css';

interface ChatListProps {
  pressed: ReplicaState['pressed'];
  surface?: ScreenSurface;
}

const HOVER_ROW_ID = 'artem';

export function ChatList({ pressed, surface }: ChatListProps) {
  const pressedRowId = pressed === PRESS.row ? 'artem' : null;

  return (
    <div className={styles.column}>
      <div className={styles.top}>
        <div className={styles.headerRow}>
          <IconBtn icon="menu" />
          <span className={styles.searchTrigger}>
            <SearchGlyph />
            <span className={styles.searchLabel}>{DESKTOP_TEXT.searchPlaceholder}</span>
            <span className={styles.hotkey}>{DESKTOP_TEXT.searchHotkey}</span>
          </span>
        </div>

        <div className={styles.filters}>
          {CHAT_FILTERS.map((label, index) => (
            <span key={label} className={cx(styles.tab, index === 0 && styles.tabActive)}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.list} ref={surface?.viewport}>
        <div className={styles.listInner} ref={surface?.inner}>
          {CHAT_ROWS.map((row) => (
            <div
              key={row.id}
              className={cx(
                styles.row,
                row.id === pressedRowId && styles.rowActive,
                row.id === HOVER_ROW_ID && styles.rowHovered,
              )}
            >
              <Avatar label={row.title} colorKey={row.id} size={54} online={row.online} />
              <div className={styles.body}>
                <div className={styles.rowTop}>
                  <span className={styles.titleWrap}>
                    <span className={styles.title}>{row.title}</span>
                    {row.official && <OfficialMark />}
                  </span>
                  {row.sent && <Icon name="check" size={15} className={styles.sentMark} />}
                  <span className={styles.time}>{row.time}</span>
                </div>
                <div className={styles.rowBottom}>
                  <p className={styles.preview}>
                    {row.icon && <Icon name={row.icon} size={14} className={styles.attachIcon} />}
                    {row.authorPrefix && <span className={styles.author}>{row.authorPrefix}</span>}
                    {row.preview}
                  </p>
                  <Badge count={row.unread} muted={row.muted} />
                </div>
              </div>
              {row.id === HOVER_ROW_ID && <Cursor top={38} left={64} />}
            </div>
          ))}
        </div>
      </div>

      <Fab />
    </div>
  );
}
