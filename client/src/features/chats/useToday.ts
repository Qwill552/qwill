import { useEffect, useState } from 'react';

const NEXT_DAY_MARGIN_MS = 500;

export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function msUntilNextDay(now: Date = new Date()): number {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.getTime() - now.getTime() + NEXT_DAY_MARGIN_MS;
}

export function useToday(): Date {
  const [today, setToday] = useState(startOfToday);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = (): void => {
      clearTimeout(timer);
      const current = startOfToday();
      setToday((previous) => (previous.getTime() === current.getTime() ? previous : current));
      timer = setTimeout(sync, msUntilNextDay());
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') sync();
    };

    timer = setTimeout(sync, msUntilNextDay());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return today;
}
