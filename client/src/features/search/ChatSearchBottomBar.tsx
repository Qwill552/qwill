import { useState } from 'react';

import { useChatSearchStore } from '../../stores/chatSearchStore';
import { GlassButton } from '../../ui/chrome/GlassButton';
import { Icon } from '../../ui/Icon';
import { ChatCalendar } from '../calendar/ChatCalendar';
import { dayKeyOfIso } from '../calendar/calendarDates';
import { plural } from '../chat/plural';
import { jumpToSearchResult } from './jumpToSearchResult';
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

  const [calendarOpen, setCalendarOpen] = useState(false);

  const current = results[index];
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
          <GlassButton icon="chevron-up" label="К более старому совпадению" disabled={!canOlder} onClick={next} />
          <GlassButton icon="chevron-down" label="К более новому совпадению" disabled={!canNewer} onClick={prev} />
        </div>
      )}

      <div className={styles.bar}>
        <button
          type="button"
          className={styles.calendar}
          aria-label="Календарь"
          onClick={() => setCalendarOpen(true)}
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

      {calendarOpen && (
        <ChatCalendar
          chatId={chatId}
          filter="all"
          anchorDate={dayKeyOfIso(current?.createdAt ?? new Date().toISOString())}
          onPick={(day) => {
            setCalendarOpen(false);
            void jumpToSearchResult(chatId, day.firstMessageId);
          }}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </div>
  );
}
