import type { ChatCalendarDay, FileDto } from '@messenger/shared';

import { useFileSrc } from '../../api/useFileSrc';
import { dayKeyIn, dayTitle, monthDayCount, monthLeadingBlanks, monthTitle, shiftMonth } from './calendarDates';
import styles from './ChatCalendar.module.css';

interface CalendarMonthProps {
  month: string;
  chatId: string;
  days: Map<string, ChatCalendarDay>;
  selected: string | null;
  /** Данные месяца ещё не приехали — пустая клетка тут значит «не знаем», а не «не писали». */
  loading?: boolean;
  withTitle?: boolean;
  /** Дни соседних месяцев: на телефоне их нет вовсе, на десктопе они видны приглушёнными. */
  neighbours?: boolean;
  onPick: (day: ChatCalendarDay) => void;
}

/** Файл раздаётся только с токеном, поэтому прямой src в <img> получает 401 — миниатюра
 *  идёт тем же путём, что и вся медиа клиента: кэш, объектный URL. */
function DayPreview({ file, chatId }: { file: FileDto; chatId: string }) {
  const src = useFileSrc(file.id, { tier: 'thumb', chatId, kind: 'photo' });
  if (!src) return null;
  return <img className={styles.cellPreview} src={src} alt="" loading="lazy" />;
}

export function CalendarMonth({
  month,
  chatId,
  days,
  selected,
  loading = false,
  withTitle = true,
  neighbours = false,
  onPick,
}: CalendarMonthProps) {
  const blanks = monthLeadingBlanks(month);
  const count = monthDayCount(month);
  const previous = shiftMonth(month, -1);
  const previousCount = monthDayCount(previous);
  const trailing = (7 - ((blanks + count) % 7)) % 7;

  return (
    <section className={styles.month} data-month={month}>
      {withTitle && <h3 className={styles.monthTitle}>{monthTitle(month)}</h3>}
      <div className={`${styles.grid} ${loading ? styles.gridLoading : ''}`}>
        {Array.from({ length: blanks }, (_, index) => (
          <span key={`lead-${index}`} className={styles.outside} aria-hidden="true">
            {neighbours ? previousCount - blanks + index + 1 : ''}
          </span>
        ))}

        {Array.from({ length: count }, (_, index) => {
          const key = dayKeyIn(month, index + 1);
          const day = days.get(key);
          return (
            <button
              key={key}
              type="button"
              className={`${styles.cell} ${selected === key ? styles.cellSelected : ''} ${
                day?.preview ? styles.cellWithPhoto : ''
              }`}
              disabled={!day}
              aria-label={day ? `${dayTitle(key)}, сообщений: ${day.count}` : dayTitle(key)}
              onClick={day ? () => onPick(day) : undefined}
            >
              {day?.preview && <DayPreview file={day.preview} chatId={chatId} />}
              <span className={styles.cellNumber}>{index + 1}</span>
              {day && <span className={styles.cellCount}>{day.count > 99 ? '99+' : day.count}</span>}
            </button>
          );
        })}

        {Array.from({ length: trailing }, (_, index) => (
          <span key={`trail-${index}`} className={styles.outside} aria-hidden="true">
            {neighbours ? index + 1 : ''}
          </span>
        ))}
      </div>
    </section>
  );
}
