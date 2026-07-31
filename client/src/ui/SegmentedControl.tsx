import type { CSSProperties } from 'react';

import styles from './SegmentedControl.module.css';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Подпись группы для скринридера. */
  label?: string;
  className?: string;
}

/** Сегментный переключатель: подложка активного сегмента едет между позициями.
 *  Сегменты равной ширины — иначе поездка потребовала бы измерения DOM на каждый ре-рендер. */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  const activeIndex = Math.max(
    0,
    segments.findIndex((segment) => segment.value === value),
  );

  const style = {
    ['--seg-count' as string]: segments.length,
    ['--seg-index' as string]: activeIndex,
  } as CSSProperties;

  return (
    <div className={`${styles.control} ${className ?? ''}`} style={style} role="radiogroup" aria-label={label}>
      <span className={styles.thumb} aria-hidden="true" />
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          role="radio"
          aria-checked={segment.value === value}
          className={`${styles.segment} ${segment.value === value ? styles.segmentActive : ''}`}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
