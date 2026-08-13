import { useEffect, useState } from 'react';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function useCallDuration(startedAt: number | null): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (startedAt === null) return null;
  return formatDuration(Date.now() - startedAt);
}
