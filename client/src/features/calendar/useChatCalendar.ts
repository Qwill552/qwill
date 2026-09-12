import { CHAT_CALENDAR_MAX_MONTHS, type ChatCalendarDay, type ChatCalendarFilter } from '@messenger/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { chatCalendarRequest } from '../../api/chats';
import { monthFirstDay, monthFromIndex, monthIndex, monthLastDay } from './calendarDates';

export interface ChatCalendarData {
  days: Map<string, ChatCalendarDay>;
  minDate: string | null;
  maxDate: string | null;
  status: 'loading' | 'ready' | 'error';
  ensureMonths: (from: string, to: string) => void;
}

export function useChatCalendar(chatId: string, filter: ChatCalendarFilter): ChatCalendarData {
  const [days, setDays] = useState<Map<string, ChatCalendarDay>>(() => new Map());
  const [bounds, setBounds] = useState<{ minDate: string | null; maxDate: string | null }>({
    minDate: null,
    maxDate: null,
  });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const requestedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef(0);

  useEffect(() => {
    requestedRef.current = new Set();
    pendingRef.current = 0;
    setDays(new Map());
    setBounds({ minDate: null, maxDate: null });
    setStatus('loading');
  }, [chatId, filter]);

  const ensureMonths = useCallback(
    (from: string, to: string) => {
      const first = monthIndex(from);
      const last = monthIndex(to);
      const missing: number[] = [];
      for (let index = first; index <= last; index += 1) {
        const month = monthFromIndex(index);
        if (requestedRef.current.has(month)) continue;
        requestedRef.current.add(month);
        missing.push(index);
      }
      if (missing.length === 0) return;

      const head = monthFromIndex(Math.max(missing[0]!, missing.at(-1)! - CHAT_CALENDAR_MAX_MONTHS));
      const tail = monthFromIndex(missing.at(-1)!);
      pendingRef.current += 1;
      setStatus('loading');

      chatCalendarRequest(chatId, { from: monthFirstDay(head), to: monthLastDay(tail) }, filter)
        .then((response) => {
          setDays((prev) => {
            const next = new Map(prev);
            for (const day of response.days) next.set(day.date, day);
            return next;
          });
          setBounds({ minDate: response.minDate, maxDate: response.maxDate });
          pendingRef.current -= 1;
          if (pendingRef.current === 0) setStatus('ready');
        })
        .catch(() => {
          for (let index = missing[0]!; index <= missing.at(-1)!; index += 1) {
            requestedRef.current.delete(monthFromIndex(index));
          }
          pendingRef.current -= 1;
          if (pendingRef.current === 0) setStatus('error');
        });
    },
    [chatId, filter],
  );

  return { days, minDate: bounds.minDate, maxDate: bounds.maxDate, status, ensureMonths };
}
