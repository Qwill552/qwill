import { Avatar, SearchGlyph } from '../phone/Chrome';
import { CHAT_ROWS, DESKTOP_RECENT_IDS, DESKTOP_TEXT } from '../phone/demoData';
import styles from './SearchPanel.module.css';

export function SearchPanel() {
  const recent = DESKTOP_RECENT_IDS.map((id) => CHAT_ROWS.find((row) => row.id === id)).filter(
    (row): row is NonNullable<typeof row> => row !== undefined,
  );

  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <SearchGlyph />
        <span className={styles.placeholder}>{DESKTOP_TEXT.searchPlaceholder}</span>
        <span className={styles.hotkey}>{DESKTOP_TEXT.searchHotkey}</span>
      </div>

      <span className={styles.label}>{DESKTOP_TEXT.recentLabel}</span>

      <div className={styles.list}>
        {recent.map((row) => (
          <div key={row.id} className={styles.row}>
            <Avatar label={row.title} colorKey={row.id} size={40} online={row.online} />
            <span className={styles.title}>{row.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
