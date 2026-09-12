import { useState } from 'react';

import { useChatSearchStore } from '../../stores/chatSearchStore';
import { GlassButton } from '../../ui/chrome/GlassButton';
import { Icon } from '../../ui/Icon';
import { DatePickerSheet } from '../calendar/DatePickerSheet';
import { plural } from '../chat/plural';
import styles from './ChatSearchBottomBar.module.css';

interface ChatSearchBottomBarProps {
  chatId: string;
}

export function ChatSearchBottomBar({ chatId }: ChatSearchBottomBarProps) {
  const results = useChatSearchStore((s) => s.results);
  const total = useChatSearchStore((s) => s.total);
  const index = useChatSearchStore((s) => s.index);
  const hasMore = useChatSearchStore((s) => s.hasMore);
  const loading = useChatSearchStore((s) => s.loading);
  const error = useChatSearchStore((s) => s.error);
  const mode = useChatSearchStore((s) => s.mode);
  const setMode = useChatSearchStore((s) => s.setMode);
  const next = useChatSearchStore((s) => s.next);
  const prev = useChatSearchStore((s) => s.prev);

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const canOlder = index + 1 < results.length || hasMore;
  const canNewer = index > 0;
  const listMode = mode === 'list';

  const counter = error
    ? error
    : loading && results.length === 0
      ? 'Ищу…'
      : total === 0
        ? 'Ничего не найдено'
        : listMode
          ? `${total} ${plural(total, 'результат', 'результата', 'результатов')}`
          : `${index + 1} из ${total}`;

  return (
    <div className={styles.wrap}>
      {!listMode && (
        <div className={styles.arrows}>
          <GlassButton
            icon="chevron-up"
            label="К более старому совпадению"
            disabled={!canOlder}
            onClick={next}
          />
          <GlassButton
            icon="chevron-down"
            label="К более новому совпадению"
            disabled={!canNewer}
            onClick={prev}
          />
        </div>
      )}

      <div className={styles.bar}>
        <button
          type="button"
          className={styles.calendar}
          aria-label="Календарь"
          onClick={() => setDatePickerOpen(true)}
        >
          <Icon name="calendar" size={20} />
        </button>

        <span className={styles.counter} aria-live="polite">
          {counter}
        </span>

        <button type="button" className={styles.toggle} onClick={() => setMode(listMode ? 'chat' : 'list')}>
          {listMode ? 'В чате' : 'Списком'}
        </button>
      </div>

      {datePickerOpen && <DatePickerSheet chatId={chatId} onClose={() => setDatePickerOpen(false)} />}
    </div>
  );
}
