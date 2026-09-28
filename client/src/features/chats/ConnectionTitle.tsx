import { useEffect, useRef, useState, type AnimationEvent } from 'react';

import { titleDelayMs, titleKindOf, useConnectionStatus, type TitleKind } from '../../realtime/connectionStatus';
import { LiveEllipsis } from '../../ui/LiveEllipsis';
import { CONNECTION_TEXT } from '../chat/chatSubtitle';
import styles from './ConnectionTitle.module.css';

const TITLE_TEXT: Record<TitleKind, string> = { brand: 'Qwill', ...CONNECTION_TEXT };

const ANIMATED_DOTS: ReadonlySet<TitleKind> = new Set(['waiting', 'connecting', 'updating']);

interface SwapState {
  shown: TitleKind;
  leaving: TitleKind | null;
  generation: number;
}

function TitleText({ kind, className, onAnimationEnd }: { kind: TitleKind; className: string; onAnimationEnd?: () => void }) {
  const brand = kind === 'brand';
  return (
    <span
      className={`${className} ${brand ? styles.brand : styles.status}`}
      onAnimationEnd={
        onAnimationEnd
          ? (event: AnimationEvent<HTMLSpanElement>) => {
              if (event.target === event.currentTarget) onAnimationEnd();
            }
          : undefined
      }
    >
      {TITLE_TEXT[kind]}
      {ANIMATED_DOTS.has(kind) && <LiveEllipsis />}
    </span>
  );
}

export function ConnectionTitle() {
  const target = useConnectionStatus(titleKindOf);
  const [swap, setSwap] = useState<SwapState>(() => ({
    shown: titleDelayMs(target) > 0 ? 'brand' : target,
    leaving: null,
    generation: 0,
  }));
  const targetRef = useRef(target);
  const swapRef = useRef(swap);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  swapRef.current = swap;

  function startSwap(next: TitleKind): void {
    const current = swapRef.current;
    if (current.leaving !== null || current.shown === next) return;
    const nextSwap = { shown: next, leaving: current.shown, generation: current.generation + 1 };
    swapRef.current = nextSwap;
    setSwap(nextSwap);
  }

  function scheduleSwap(next: TitleKind): void {
    clearTimeout(timerRef.current);
    const current = swapRef.current;
    if (current.leaving !== null || current.shown === next) return;
    const delay = titleDelayMs(next);
    if (delay === 0) startSwap(next);
    else timerRef.current = setTimeout(() => startSwap(targetRef.current), delay);
  }

  function finishSwap(): void {
    const finished = { ...swapRef.current, leaving: null };
    swapRef.current = finished;
    setSwap(finished);
    scheduleSwap(targetRef.current);
  }

  useEffect(() => {
    targetRef.current = target;
    scheduleSwap(target);
  }, [target]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <span className={styles.title} role="status">
      {swap.leaving !== null && (
        <TitleText key={`leave-${swap.generation}`} kind={swap.leaving} className={`${styles.text} ${styles.leave}`} />
      )}
      <TitleText
        key={`show-${swap.generation}`}
        kind={swap.shown}
        className={`${styles.text} ${swap.leaving !== null ? styles.enter : ''}`}
        onAnimationEnd={swap.leaving !== null ? finishSwap : undefined}
      />
    </span>
  );
}
