import { Icon } from '../../../../../ui/Icon';
import { Avatar, Badge, Chip, DotsGlyph, Fab, OfficialMark, SearchGlyph, TabBar } from './Chrome';
import { CHAT_FILTERS, CHAT_ROWS, REPLICA_TEXT, type ScreenSurface } from './demoData';
import styles from './ChatsScreen.module.css';

interface ChatsScreenProps {
  surface?: ScreenSurface;
}

const UNREAD_TOTAL = CHAT_ROWS.reduce((sum, row) => sum + row.unread, 0);

export function ChatsScreen({ surface }: ChatsScreenProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <div className={styles.headerRow}>
          <div className={styles.brand}>
            <Avatar label="Вы" colorKey="me" size={38} />
            <span className={styles.wordmark}>{REPLICA_TEXT.wordmark}</span>
          </div>
          <div className={styles.actions}>
            <span className={styles.iconBtn}>
              <DotsGlyph />
            </span>
          </div>
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchTrigger}>
            <SearchGlyph />
            <span className={styles.searchLabel}>{REPLICA_TEXT.searchPlaceholder}</span>
          </span>
        </div>

        <div className={styles.filters}>
          {CHAT_FILTERS.map((label, index) => (
            <Chip key={label} label={label} active={index === 0} />
          ))}
        </div>
      </div>

      <div className={styles.list} ref={surface?.viewport}>
        <div className={styles.listInner} ref={surface?.inner}>
          {CHAT_ROWS.map((row) => (
            <div key={row.id} className={styles.row} data-demo-tap="chat">
              <Avatar label={row.title} colorKey={row.id} size={52} online={row.online} shadow />
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
            </div>
          ))}
        </div>
      </div>

      <Fab />
      <TabBar activeId="chats" unread={UNREAD_TOTAL} />
    </div>
  );
}
