import { useEffect, useRef, useState } from 'react';

import { chatCalendarRequest, messageAtDateRequest } from '../../api/chats';
import { Sheet } from '../../ui/Sheet';
import { Spinner } from '../../ui/Spinner';
import { WheelPicker } from '../../ui/WheelPicker';
import { jumpToSearchResult } from '../search/jumpToSearchResult';
import { dayKeyOf, MONTH_NAMES } from './calendarDates';
import styles from './DatePickerSheet.module.css';

const LOADING_YEARS_BACK = 20;
const SPINNER_DELAY_MS = 1000;
const JUMP_FAILED = 'Не удалось перейти к дате';

interface DateParts {
  year: number;
  month: number;
  day: number;
}

interface Range {
  min: number;
  max: number;
}

interface Resolved {
  parts: DateParts;
  years: Range;
  months: Range;
  days: Range;
}

interface DatePickerSheetProps {
  chatId: string;
  onClose: () => void;
}

function partsOf(date: Date): DateParts {
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function partsOfKey(key: string): DateParts {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1, day: Number(key.slice(8, 10)) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function resolve(wanted: DateParts, min: DateParts, max: DateParts): Resolved {
  const years = { min: min.year, max: max.year };
  const year = clamp(wanted.year, years.min, years.max);

  const months = { min: year === min.year ? min.month : 0, max: year === max.year ? max.month : 11 };
  const month = clamp(wanted.month, months.min, months.max);

  const total = daysInMonth(year, month);
  const days = {
    min: year === min.year && month === min.month ? min.day : 1,
    max: year === max.year && month === max.month ? Math.min(max.day, total) : total,
  };
  const day = clamp(wanted.day, days.min, days.max);

  return { parts: { year, month, day }, years, months, days };
}

function keyOf(parts: DateParts): string {
  return dayKeyOf(new Date(parts.year, parts.month, parts.day));
}

export function DatePickerSheet({ chatId, onClose }: DatePickerSheetProps) {
  const today = useRef(partsOf(new Date())).current;
  const [minDate, setMinDate] = useState<DateParts | null>(null);
  const [wanted, setWanted] = useState<DateParts>(today);
  const [jumping, setJumping] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const key = keyOf(today);
    chatCalendarRequest(chatId, { from: key, to: key }, 'all')
      .then((calendar) => {
        if (!alive) return;
        setMinDate(calendar.minDate ? partsOfKey(calendar.minDate) : today);
      })
      .catch(() => {
        if (alive) setMinDate(today);
      });
    return () => {
      alive = false;
    };
  }, [chatId, today]);

  const floor = minDate ?? { year: today.year - LOADING_YEARS_BACK, month: 0, day: 1 };
  const resolved = resolve(wanted, floor, today);
  const { parts, years, months, days } = resolved;

  async function jump(): Promise<void> {
    setJumping(true);
    setError(null);
    const timer = window.setTimeout(() => setWaiting(true), SPINNER_DELAY_MS);

    try {
      const { messageId } = await messageAtDateRequest(chatId, keyOf(parts));
      if (messageId === null) {
        onClose();
        return;
      }
      const outcome = await jumpToSearchResult(chatId, messageId);
      if (outcome === 'failed') {
        setError(JUMP_FAILED);
        return;
      }
      onClose();
    } catch {
      setError(JUMP_FAILED);
    } finally {
      window.clearTimeout(timer);
      setJumping(false);
      setWaiting(false);
    }
  }

  return (
    <Sheet title="Выбрать дату" onClose={onClose}>
      <div className={styles.row}>
        <WheelPicker
          label="День"
          value={parts.day}
          min={days.min}
          max={days.max}
          textOffset={10}
          format={(day) => String(day)}
          onChange={(day) => setWanted((previous) => ({ ...previous, day }))}
        />
        <WheelPicker
          label="Месяц"
          value={parts.month}
          min={months.min}
          max={months.max}
          textOffset={-10}
          format={(month) => MONTH_NAMES[month] ?? ''}
          onChange={(month) => setWanted((previous) => ({ ...previous, month }))}
        />
        <WheelPicker
          label="Год"
          value={parts.year}
          min={years.min}
          max={years.max}
          textOffset={-24}
          format={(year) => String(year)}
          onChange={(year) => setWanted((previous) => ({ ...previous, year }))}
        />
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button type="button" className={styles.jump} disabled={minDate === null || jumping} onClick={() => void jump()}>
        {waiting ? <Spinner size={20} label="Ищу дату" /> : 'Перейти к дате'}
      </button>
    </Sheet>
  );
}
