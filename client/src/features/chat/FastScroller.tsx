import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

import { Icon } from '../../ui/Icon';
import { formatMonthLong } from '../../utils/dateFormats';
import styles from './FastScroller.module.css';

const HIDE_DELAY_MS = 1500;
/** Тап отделяется от протяжки так же, как в Telegram (RecyclerListView.java:689). */
const TAP_MAX_MS = 200;
const TAP_SLOP_PX = 8;

export interface FastScrollItem {
  createdAt: string;
}

export interface FastScrollBinding {
  listRef: (element: HTMLElement | null) => void;
  setItems: (items: FastScrollItem[]) => void;
}

interface FastScrollerProps {
  scroller: HTMLElement | null;
  sentinelRef: RefObject<HTMLElement | null>;
  listRef: RefObject<HTMLElement | null>;
  itemsRef: RefObject<FastScrollItem[]>;
  /** Короткий тап по ползунку и нажатие плашки месяца открывают календарь (R-33A). */
  onOpenCalendar?: (iso: string) => void;
}

interface Metrics {
  start: number;
  span: number;
  travel: number;
  top: number;
}

interface Drag {
  pointerId: number;
  grabY: number;
  startOffset: number;
  startTime: number;
  labelled: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function monthKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function monthLabel(iso: string): string {
  const date = new Date(iso);
  const month = formatMonthLong(date);
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${date.getFullYear()}`;
}

export function FastScroller({ scroller, sentinelRef, listRef, itemsRef, onOpenCalendar }: FastScrollerProps) {
  const [offset, setOffset] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [label, setLabel] = useState<{ text: string; iso: string } | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const dragRef = useRef<Drag | null>(null);
  const offsetRef = useRef(0);

  offsetRef.current = offset;

  function measure(): Metrics | null {
    const sentinel = sentinelRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!scroller || !sentinel || !track || !thumb) return null;
    const style = getComputedStyle(scroller);
    const insetTop = parseFloat(style.paddingTop) || 0;
    const insetBottom = parseFloat(style.paddingBottom) || 0;
    const scrollerRect = scroller.getBoundingClientRect();
    const top = track.getBoundingClientRect().top;
    const anchor = scroller.scrollTop + sentinel.getBoundingClientRect().top - scrollerRect.top;
    const start = Math.max(0, anchor - insetTop);
    return {
      start,
      span: Math.max(0, scroller.scrollHeight - scroller.clientHeight - start),
      travel: Math.max(0, scrollerRect.bottom - insetBottom - top - thumb.offsetHeight),
      top,
    };
  }

  function apply(metrics: Metrics, scrollTop: number): void {
    const ratio = metrics.span > 0 ? clamp((scrollTop - metrics.start) / metrics.span, 0, 1) : 0;
    setOffset(ratio * metrics.travel);
  }

  function firstVisibleIndex(metrics: Metrics): number | null {
    const list = listRef.current;
    const items = itemsRef.current;
    if (!list || items.length === 0) return null;
    const count = Math.min(list.children.length, items.length);
    if (count === 0) return null;
    let low = 0;
    let high = count - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      const child = list.children[middle];
      if (!child) break;
      if (child.getBoundingClientRect().bottom > metrics.top) high = middle;
      else low = middle + 1;
    }
    return low;
  }

  function visibleIso(): string | null {
    const metrics = measure();
    if (!metrics) return null;
    const index = firstVisibleIndex(metrics);
    return index === null ? null : (itemsRef.current[index]?.createdAt ?? null);
  }

  function severalMonths(): boolean {
    const items = itemsRef.current;
    const first = items[0];
    if (!first) return false;
    const key = monthKey(first.createdAt);
    return items.some((item) => monthKey(item.createdAt) !== key);
  }

  function updateLabel(metrics: Metrics): void {
    const index = firstVisibleIndex(metrics);
    const item = index === null ? null : itemsRef.current[index];
    setLabel(item ? { text: monthLabel(item.createdAt), iso: item.createdAt } : null);
  }

  useEffect(() => {
    if (!scroller) return;

    function refresh(reveal: boolean): void {
      const node = scroller;
      const metrics = measure();
      if (!node || !metrics) return;
      apply(metrics, node.scrollTop);
      const drag = dragRef.current;
      if (drag) {
        if (drag.labelled) updateLabel(metrics);
        return;
      }
      if (!reveal) return;
      window.clearTimeout(hideTimer.current);
      if (node.scrollTop < metrics.start) {
        setVisible(false);
        return;
      }
      setVisible(true);
      hideTimer.current = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    }

    function handleScroll(): void {
      refresh(true);
    }

    refresh(false);
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    const observer = new ResizeObserver(() => refresh(false));
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      window.clearTimeout(hideTimer.current);
    };
  }, [scroller]);

  useEffect(() => {
    function handleMove(event: globalThis.PointerEvent): void {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId || !scroller) return;
      const metrics = measure();
      if (!metrics) return;
      const next = clamp(drag.startOffset + (event.clientY - drag.grabY), 0, metrics.travel);
      setOffset(next);
      scroller.scrollTop = metrics.start + (metrics.travel > 0 ? (next / metrics.travel) * metrics.span : 0);
      if (drag.labelled) updateLabel(metrics);
    }

    function handleUp(event: globalThis.PointerEvent): void {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS);

      const tapped =
        event.type === 'pointerup' &&
        event.timeStamp - drag.startTime < TAP_MAX_MS &&
        Math.abs(event.clientY - drag.grabY) <= TAP_SLOP_PX;
      if (!tapped || !onOpenCalendar) return;
      const iso = visibleIso();
      if (iso) onOpenCalendar(iso);
    }

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  });

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>): void {
    if (!event.isPrimary || dragRef.current) return;
    const metrics = measure();
    if (!metrics) return;
    const labelled = severalMonths();
    dragRef.current = {
      pointerId: event.pointerId,
      grabY: event.clientY,
      startOffset: offsetRef.current,
      startTime: event.timeStamp,
      labelled,
    };
    setDragging(true);
    setVisible(true);
    window.clearTimeout(hideTimer.current);
    if (labelled) updateLabel(metrics);
  }

  const interactive = onOpenCalendar !== undefined;

  return (
    <div ref={trackRef} className={styles.track} aria-hidden={interactive ? undefined : 'true'}>
      {label && (
        <button
          type="button"
          className={`${styles.label} ${visible ? styles.labelVisible : ''} ${dragging ? styles.labelDragging : ''}`}
          style={{ transform: `translateY(${offset}px)` }}
          data-no-back-swipe="true"
          aria-label={`Календарь, ${label.text}`}
          tabIndex={interactive && visible ? 0 : -1}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onOpenCalendar?.(label.iso)}
        >
          {label.text}
        </button>
      )}
      <button
        ref={thumbRef}
        type="button"
        className={`${styles.thumb} ${visible ? styles.visible : ''} ${dragging ? styles.dragging : ''}`}
        style={{ transform: `translateY(${offset}px)` }}
        data-no-back-swipe="true"
        aria-label="Календарь"
        tabIndex={interactive && visible ? 0 : -1}
        onPointerDown={handlePointerDown}
        onClick={(event) => {
          if (event.detail !== 0) return;
          const iso = visibleIso();
          if (iso) onOpenCalendar?.(iso);
        }}
      >
        <Icon name="chevron-up" size={16} className={styles.glyph} />
        <Icon name="chevron-down" size={16} className={styles.glyph} />
      </button>
    </div>
  );
}
