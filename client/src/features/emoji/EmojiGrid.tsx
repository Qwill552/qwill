import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { Emoji } from './Emoji';
import type { EmojiLayout } from './emojiLayout';
import styles from './EmojiGrid.module.css';

const OVERSCAN_PX = 200;

interface EmojiGridProps {
  layout: EmojiLayout;
  containerRef: RefObject<HTMLDivElement | null>;
  onSelect: (emoji: string) => void;
  onVisibleSectionChange?: (sectionIndex: number) => void;
}

function findStartIndex(offsets: number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((offsets[mid] ?? 0) <= y) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export function EmojiGrid({ layout, containerRef, onSelect, onVisibleSectionChange }: EmojiGridProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(layout.rows.length, 40) });

  useEffect(() => {
    const container = containerRef.current;
    const anchor = anchorRef.current;
    if (!container || !anchor) return;

    let frame = 0;

    function measure(): void {
      frame = 0;
      const anchorTop = anchor!.getBoundingClientRect().top;
      const containerTop = container!.getBoundingClientRect().top;
      const scrolledPast = Math.max(0, containerTop - anchorTop);

      const viewTop = Math.max(0, scrolledPast - OVERSCAN_PX);
      const viewBottom = scrolledPast + container!.clientHeight + OVERSCAN_PX;

      const start = findStartIndex(layout.offsets, viewTop);
      let end = start;
      while (end < layout.rows.length && (layout.offsets[end] ?? 0) < viewBottom) end++;

      setRange({ start, end });
      onVisibleSectionChange?.(layout.rows[start]?.sectionIndex ?? 0);
    }

    function onScroll(): void {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    }

    measure();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [containerRef, layout, onVisibleSectionChange]);

  const visible = layout.rows.slice(range.start, range.end);
  const paddingTop = layout.offsets[range.start] ?? 0;
  const paddingBottom = Math.max(0, layout.totalHeight - (layout.offsets[range.end] ?? layout.totalHeight));

  return (
    <div>
      <div ref={anchorRef} aria-hidden="true" />
      {layout.rows.length === 0 ? (
        <p className={styles.empty}>Ничего не найдено</p>
      ) : (
        <div style={{ paddingTop, paddingBottom }}>
          {visible.map((row, i) =>
            row.kind === 'header' ? (
              <div key={`h-${range.start + i}`} className={styles.sectionHeader}>
                {row.label}
              </div>
            ) : (
              <div key={`r-${range.start + i}`} className={styles.grid}>
                {row.entries.map((entry, j) => (
                  <button
                    key={`${entry.e}-${range.start + i}-${j}`}
                    type="button"
                    className={styles.cell}
                    onClick={() => onSelect(entry.e)}
                    aria-label={entry.k[0] ?? entry.e}
                    title={entry.k[0] ?? entry.e}
                  >
                    <Emoji emoji={entry.e} size={34} />
                  </button>
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
