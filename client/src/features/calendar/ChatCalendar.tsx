import type { ChatCalendarDay, ChatCalendarFilter } from '@messenger/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useLayoutMode } from '../../app/useLayoutMode';
import { Icon } from '../../ui/Icon';
import { scrollParentOf } from '../../ui/scrollParent';
import { Sheet } from '../../ui/Sheet';
import { Modal } from '../groups/Modal';
import { CalendarMonth } from './CalendarMonth';
import { monthFromIndex, monthIndex, monthOf, monthTitle, shiftMonth, WEEKDAY_LETTERS } from './calendarDates';
import { useChatCalendar } from './useChatCalendar';
import styles from './ChatCalendar.module.css';

const WINDOW_STEP = 3;

interface ChatCalendarProps {
  chatId: string;
  filter: ChatCalendarFilter;
  /** День, на котором календарь открывается, — `YYYY-MM-DD`. */
  anchorDate: string;
  selected?: string | null;
  onPick: (day: ChatCalendarDay) => void;
  onClose: () => void;
}

export function ChatCalendar({ chatId, filter, anchorDate, selected = null, onPick, onClose }: ChatCalendarProps) {
  const desktop = useLayoutMode() === 'desktop';
  const calendar = useChatCalendar(chatId, filter);
  const anchorMonth = monthOf(anchorDate);

  const body = desktop ? (
    <DesktopMonths chatId={chatId} anchorMonth={anchorMonth} selected={selected} calendar={calendar} onPick={onPick} />
  ) : (
    <MobileMonths chatId={chatId} anchorMonth={anchorMonth} selected={selected} calendar={calendar} onPick={onPick} />
  );

  if (desktop) {
    return (
      <Modal title="Календарь" onClose={onClose}>
        {body}
      </Modal>
    );
  }

  return (
    <Sheet title="Календарь" onClose={onClose}>
      {body}
    </Sheet>
  );
}

interface MonthsProps {
  chatId: string;
  anchorMonth: string;
  selected: string | null;
  calendar: ReturnType<typeof useChatCalendar>;
  onPick: (day: ChatCalendarDay) => void;
}

function Weekdays() {
  return (
    <div className={styles.weekdays} aria-hidden="true">
      {WEEKDAY_LETTERS.map((letter) => (
        <span key={letter}>{letter}</span>
      ))}
    </div>
  );
}

function MobileMonths({ chatId, anchorMonth, selected, calendar, onPick }: MonthsProps) {
  const { days, minDate, maxDate, status, settled, ensureMonths } = calendar;
  const [range, setRange] = useState(() => ({ earliest: shiftMonth(anchorMonth, -WINDOW_STEP + 1), latest: anchorMonth }));

  const stackRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<Element | null>(null);
  const anchorPlaced = useRef(false);
  const keepAnchor = useRef<{ height: number; top: number } | null>(null);

  const floor = minDate ? monthOf(minDate) : null;
  const ceiling = maxDate ? monthOf(maxDate) : null;
  const canOlder = floor === null || monthIndex(range.earliest) > monthIndex(floor);
  const canNewer = ceiling !== null && monthIndex(range.latest) < monthIndex(ceiling);

  useEffect(() => {
    ensureMonths(range.earliest, range.latest);
  }, [ensureMonths, range]);

  useLayoutEffect(() => {
    scrollerRef.current = scrollParentOf(stackRef.current);
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const kept = keepAnchor.current;
    if (kept) {
      keepAnchor.current = null;
      scroller.scrollTop = kept.top + (scroller.scrollHeight - kept.height);
      return;
    }
    if (anchorPlaced.current) return;
    anchorPlaced.current = true;
    scroller.scrollTop = scroller.scrollHeight;
  }, [range]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === top && canOlder) {
            keepAnchor.current = { height: scroller.scrollHeight, top: scroller.scrollTop };
            setRange((prev) => ({ ...prev, earliest: shiftMonth(prev.earliest, -WINDOW_STEP) }));
          }
          if (entry.target === bottom && canNewer) {
            setRange((prev) => ({ ...prev, latest: shiftMonth(prev.latest, WINDOW_STEP) }));
          }
        }
      },
      { root: scroller },
    );
    if (top && canOlder) observer.observe(top);
    if (bottom && canNewer) observer.observe(bottom);
    return () => observer.disconnect();
  }, [canOlder, canNewer, range]);

  const months: string[] = [];
  for (let index = monthIndex(range.earliest); index <= monthIndex(range.latest); index += 1) {
    months.push(monthFromIndex(index));
  }

  return (
    <div ref={stackRef} className={styles.stack}>
      <Weekdays />
      <div ref={topRef} className={styles.edge} aria-hidden="true" />
      {status === 'error' && days.size === 0 && <p className={styles.failure}>Не удалось загрузить календарь</p>}
      {months.map((month) => (
        <CalendarMonth
          key={month}
          month={month}
          chatId={chatId}
          days={days}
          selected={selected}
          loading={!settled.has(month)}
          onPick={onPick}
        />
      ))}
      <div ref={bottomRef} className={styles.edge} aria-hidden="true" />
    </div>
  );
}

function DesktopMonths({ chatId, anchorMonth, selected, calendar, onPick }: MonthsProps) {
  const { days, minDate, maxDate, status, settled, ensureMonths } = calendar;
  const [month, setMonth] = useState(anchorMonth);

  useEffect(() => {
    ensureMonths(shiftMonth(month, -1), shiftMonth(month, 1));
  }, [ensureMonths, month]);

  const floor = minDate ? monthOf(minDate) : null;
  const ceiling = maxDate ? monthOf(maxDate) : null;
  const canOlder = floor === null || monthIndex(month) > monthIndex(floor);
  const canNewer = ceiling === null || monthIndex(month) < monthIndex(ceiling);

  return (
    <div className={styles.stack}>
      <div className={styles.pager}>
        <button
          type="button"
          className={styles.arrow}
          disabled={!canOlder}
          aria-label="Предыдущий месяц"
          onClick={() => setMonth((current) => shiftMonth(current, -1))}
        >
          <Icon name="back" size={20} />
        </button>
        <span className={styles.pagerTitle}>{monthTitle(month)}</span>
        <button
          type="button"
          className={styles.arrow}
          disabled={!canNewer}
          aria-label="Следующий месяц"
          onClick={() => setMonth((current) => shiftMonth(current, 1))}
        >
          <Icon name="chevron-right" size={20} />
        </button>
      </div>
      <Weekdays />
      {status === 'error' && days.size === 0 && <p className={styles.failure}>Не удалось загрузить календарь</p>}
      <CalendarMonth
        month={month}
        chatId={chatId}
        days={days}
        selected={selected}
        loading={!settled.has(month)}
        withTitle={false}
        neighbours
        onPick={onPick}
      />
    </div>
  );
}
