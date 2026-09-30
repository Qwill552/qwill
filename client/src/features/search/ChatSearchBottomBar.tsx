import { useState } from 'react';

import { useChatSearchStore } from '../../stores/chatSearchStore';
import { CharSwapText } from '../../ui/CharSwapText';
import { GlassButton } from '../../ui/chrome/GlassButton';
import { Icon } from '../../ui/Icon';
import { DatePickerSheet } from '../calendar/DatePickerSheet';
import { plural } from '../chat/plural';
import { ChatSearchMembers } from './ChatSearchMembers';
import styles from './ChatSearchBottomBar.module.css';

interface ChatSearchBottomBarProps {
  chatId: string;
  isGroup: boolean;
  onFocusField: () => void;
}

export function ChatSearchBottomBar({ chatId, isGroup, onFocusField }: ChatSearchBottomBarProps) {
  const results = useChatSearchStore((s) => s.results);
  const total = useChatSearchStore((s) => s.total);
  const index = useChatSearchStore((s) => s.index);
  const hasMore = useChatSearchStore((s) => s.hasMore);
  const loading = useChatSearchStore((s) => s.loading);
  const error = useChatSearchStore((s) => s.error);
  const mode = useChatSearchStore((s) => s.mode);
  const picking = useChatSearchStore((s) => s.picking);
  const draft = useChatSearchStore((s) => s.draft);
  const setMode = useChatSearchStore((s) => s.setMode);
  const next = useChatSearchStore((s) => s.next);
  const prev = useChatSearchStore((s) => s.prev);
  const startPicking = useChatSearchStore((s) => s.startPicking);
  const pick = useChatSearchStore((s) => s.pick);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [counterMove, setCounterMove] = useState({ index, rising: true });
  if (counterMove.index !== index) setCounterMove({ index, rising: index > counterMove.index });

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
      {!listMode && !picking && (
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

      <ChatSearchMembers
        chatId={chatId}
        query={draft}
        visible={isGroup && picking}
        onPick={(member) => {
          pick(member.userId);
          onFocusField();
        }}
      />

      <div className={styles.bar}>
        {!picking && (
          <button
            type="button"
            className={styles.calendar}
            aria-label="Перейти к дате"
            onClick={() => setDatePickerOpen(true)}
          >
            <Icon name="calendar" size={20} />
          </button>
        )}

        {isGroup && !picking && (
          <button
            type="button"
            className={styles.calendar}
            aria-label="Искать по участнику"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              startPicking();
              onFocusField();
            }}
          >
            <Icon name="user" size={20} />
          </button>
        )}

        <span className={styles.counter} aria-live="polite">
          <CharSwapText text={counter} up={counterMove.rising} />
        </span>

        <button
          type="button"
          className={styles.toggle}
          disabled={total === 0}
          aria-label={listMode ? 'В чате' : 'Списком'}
          onClick={() => setMode(listMode ? 'chat' : 'list')}
        >
          <span className={styles.toggleStack} aria-hidden="true">
            <span className={`${styles.toggleLabel} ${listMode ? styles.toggleHidden : ''}`}>Списком</span>
            <span className={`${styles.toggleLabel} ${listMode ? '' : styles.toggleHidden}`}>В чате</span>
          </span>
        </button>
      </div>

      {datePickerOpen && <DatePickerSheet chatId={chatId} onClose={() => setDatePickerOpen(false)} />}
    </div>
  );
}
