import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';

import { cssDurationMs } from '../../ui/motion';
import { formatDayLabel } from './dayLabel';
import styles from './Dividers.module.css';

interface DayLabelState {
  label: string;
  outLabel: string | null;
  dir: 1 | -1;
}

export function DateDivider({ iso, pillRef }: { iso: string; pillRef?: Ref<HTMLDivElement> }) {
  const label = formatDayLabel(iso);
  const prevIso = useRef(iso);
  const timer = useRef(0);
  const [state, setState] = useState<DayLabelState>({ label, outLabel: null, dir: 1 });

  useEffect(() => {
    if (iso === prevIso.current) return;
    const dir: 1 | -1 = new Date(iso).getTime() >= new Date(prevIso.current).getTime() ? 1 : -1;
    const outLabel = formatDayLabel(prevIso.current);
    prevIso.current = iso;
    setState({ label, outLabel, dir });

    const ms = cssDurationMs('--dur-tab');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setState((current) => (current.label === label ? { ...current, outLabel: null } : current));
    }, ms);
    return () => clearTimeout(timer.current);
  }, [iso, label]);

  return (
    <div ref={pillRef} className={styles.dayWrap}>
      <div className={styles.day} style={{ '--day-dir': state.dir } as CSSProperties}>
        <span className={styles.dayClip}>
          {state.outLabel && (
            <span key={`out-${state.outLabel}`} className={`${styles.dayText} ${styles.dayTextOut}`}>
              {state.outLabel}
            </span>
          )}
          <span key={`in-${state.label}`} className={`${styles.dayText} ${state.outLabel ? styles.dayTextIn : ''}`}>
            {state.label}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Граница прочитанного. Ставится один раз при открытии чата и не переезжает,
 *  пока чат открыт, — иначе линия убегает от глаз по мере чтения. */
export function UnreadDivider({ count }: { count: number }) {
  return (
    <div className={styles.unread}>
      {count > 0 ? `Непрочитанные · ${count}` : 'Непрочитанные'}
    </div>
  );
}
