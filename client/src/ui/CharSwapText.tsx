import { useState } from 'react';

import styles from './CharSwapText.module.css';

interface CharSwapTextProps {
  text: string;
  up: boolean;
}

interface SwapState {
  current: string;
  previous: string | null;
  up: boolean;
  version: number;
}

export function splitChange(previous: string, next: string): { head: string; gone: string; come: string; tail: string } {
  const limit = Math.min(previous.length, next.length);
  let head = 0;
  while (head < limit && previous[head] === next[head]) head += 1;
  let tail = 0;
  while (tail < limit - head && previous[previous.length - 1 - tail] === next[next.length - 1 - tail]) tail += 1;
  return {
    head: next.slice(0, head),
    gone: previous.slice(head, previous.length - tail),
    come: next.slice(head, next.length - tail),
    tail: next.slice(next.length - tail),
  };
}

export function CharSwapText({ text, up }: CharSwapTextProps) {
  const [state, setState] = useState<SwapState>({ current: text, previous: null, up, version: 0 });
  if (state.current !== text) {
    setState({ current: text, previous: state.current, up, version: state.version + 1 });
  }

  if (state.previous === null || state.current !== text) return <span className={styles.text}>{text}</span>;

  const parts = splitChange(state.previous, state.current);
  const direction = state.up ? styles.up : styles.down;
  return (
    <span className={styles.text}>
      {parts.head}
      <span key={state.version} className={`${styles.swap} ${direction}`}>
        <span className={styles.gone} aria-hidden="true">
          {parts.gone}
        </span>
        <span className={styles.come}>{parts.come}</span>
      </span>
      {parts.tail}
    </span>
  );
}
