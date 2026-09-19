import type { DemoReadout } from '../../engine/store';
import { Avatar, cx, SearchGlyph } from '../phone/Chrome';
import {
  CHAT_ROWS,
  DESKTOP_RECENT_IDS,
  DESKTOP_TEXT,
  PRESS,
  type ReplicaState,
} from '../phone/demoData';
import styles from './SearchPanel.module.css';

interface SearchPanelProps {
  state: ReplicaState;
  queryReadout?: DemoReadout;
}

function matching(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return DESKTOP_RECENT_IDS.map((id) => CHAT_ROWS.find((row) => row.id === id));
  return CHAT_ROWS.filter((row) => row.title.toLowerCase().includes(needle));
}

export function SearchPanel({ state, queryReadout }: SearchPanelProps) {
  const typed = state.searchQuery.length > 0;
  const rows = matching(state.searchQuery).filter(
    (row): row is NonNullable<typeof row> => row !== undefined,
  );

  return (
    <div className={styles.panel}>
      <div className={cx(styles.field, typed && styles.fieldFilled)}>
        <SearchGlyph />
        <span className={cx(styles.value, !typed && styles.placeholder)}>
          {typed ? <span ref={queryReadout} /> : DESKTOP_TEXT.searchPlaceholder}
          {typed && <span className={styles.caret} />}
        </span>
        <span className={styles.hotkey}>{DESKTOP_TEXT.searchHotkey}</span>
      </div>

      <span className={styles.label}>
        {typed ? DESKTOP_TEXT.foundLabel : DESKTOP_TEXT.recentLabel}
      </span>

      <div className={styles.list}>
        {rows.map((row, index) => (
          <div
            key={row.id}
            className={cx(
              styles.row,
              typed && index === 0 && styles.rowFound,
              typed && index === 0 && state.pressed === PRESS.result && styles.rowPressed,
            )}
          >
            <Avatar label={row.title} colorKey={row.id} size={40} online={row.online} />
            <span className={styles.title}>{row.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
