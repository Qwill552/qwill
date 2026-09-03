import type { ChatAttachmentCategory, ChatAttachmentCounts } from '@messenger/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { getChatAttachmentCountsRequest } from '../../api/chats';
import { haptic } from '../../ui/haptic';
import { MediaTabGrid } from './MediaTabGrid';
import { plural } from './plural';
import styles from './ChatMediaTabs.module.css';

const TAB_ORDER: { id: ChatAttachmentCategory; label: string }[] = [
  { id: 'media', label: 'Медиа' },
  { id: 'file', label: 'Файлы' },
  { id: 'voice', label: 'Голосовые' },
  { id: 'gif', label: 'GIF' },
];

const SWIPE_LOCK_PX = 10;
const SWIPE_DOMINANCE = 2;
const SWIPE_THRESHOLD = 0.4;
const SWIPE_VELOCITY = 0.344;
const SLIDE_MIN_MS = 120;
const SLIDE_MAX_MS = 400;
const SLIDE_MIN_SPEED = 700;
const SLIDE_SPEED_SCALE = 960;
const SLIDE_EASE = 'cubic-bezier(.32,0,.22,1)';
const SETTLE_MS = 420;
const SETTLE_EASE = 'cubic-bezier(.18,1.1,.32,1)';
const SETTLE_SLACK_MS = 40;
const STICKY_EPSILON_PX = 1;

interface Geometry {
  sticky: number;
  collapsed: number;
  stuck: boolean;
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  offset: number;
  progress: number;
  crossed: boolean;
  width: number;
  target: number | null;
  direction: 1 | -1;
}

function countOf(counts: ChatAttachmentCounts, id: ChatAttachmentCategory): number {
  if (id === 'media') return counts.photos + counts.videos;
  if (id === 'file') return counts.audios + counts.files;
  if (id === 'voice') return counts.voices;
  return counts.gifs;
}

function summaryOf(counts: ChatAttachmentCounts, id: ChatAttachmentCategory): string {
  if (id === 'media') {
    const parts: string[] = [];
    if (counts.photos > 0) parts.push(`${counts.photos} фото`);
    if (counts.videos > 0) parts.push(`${counts.videos} видео`);
    return parts.join(', ');
  }
  if (id === 'file') {
    const total = counts.audios + counts.files;
    return `${total} ${plural(total, 'файл', 'файла', 'файлов')}`;
  }
  if (id === 'voice') {
    return `${counts.voices} ${plural(counts.voices, 'голосовое', 'голосовых', 'голосовых')}`;
  }
  return `${counts.gifs} GIF`;
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface ChatMediaTabsProps {
  chatId: string;
  onHeaderLabel?: (label: string | null) => void;
  swipeable?: boolean;
}

export function ChatMediaTabs({ chatId, onHeaderLabel, swipeable = true }: ChatMediaTabsProps) {
  const [counts, setCounts] = useState<ChatAttachmentCounts | null>(null);
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState<number[]>([0]);
  const [slide, setSlide] = useState<{ target: number; direction: 1 | -1 } | null>(null);
  const [peek, setPeek] = useState<Record<number, number>>({});
  const [stuck, setStuck] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const rememberedRef = useRef<{ id: ChatAttachmentCategory; top: number } | null>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const slideGeometryRef = useRef<Geometry | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef<number | null>(null);
  const settleRef = useRef<number | null>(null);
  const animatingRef = useRef(false);

  const tabs = useMemo(
    () => (counts ? TAB_ORDER.filter((tab) => countOf(counts, tab.id) > 0) : []),
    [counts],
  );

  useEffect(() => {
    let cancelled = false;
    getChatAttachmentCountsRequest(chatId)
      .then((result) => {
        if (!cancelled) setCounts(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => {
    let node = sectionRef.current?.parentElement ?? null;
    while (node) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') break;
      node = node.parentElement;
    }
    scrollerRef.current = node;
  }, [tabs.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scroller = scrollerRef.current;
    if (!sentinel || !scroller) return;
    const inset = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        const rootTop = entry.rootBounds?.top ?? 0;
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top <= rootTop);
      },
      { root: scroller, rootMargin: `-${inset}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tabs.length]);

  const active = tabs[index];

  useEffect(() => {
    if (!onHeaderLabel) return;
    onHeaderLabel(stuck && counts && active ? summaryOf(counts, active.id) : null);
  }, [onHeaderLabel, stuck, counts, active]);

  useEffect(
    () => () => {
      onHeaderLabel?.(null);
      if (settleRef.current !== null) window.clearTimeout(settleRef.current);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [onHeaderLabel],
  );

  useEffect(() => {
    const row = rowRef.current;
    const button = row?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index];
    if (!row || !button) return;
    const left = button.offsetLeft - (row.clientWidth - button.offsetWidth) / 2;
    row.scrollTo({ left, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [index]);

  useLayoutEffect(() => {
    const pager = pagerRef.current;
    if (pager) {
      delete pager.dataset.animating;
      pager.style.setProperty('--dx', '0px');
    }
    animatingRef.current = false;
    const top = pendingScrollRef.current;
    pendingScrollRef.current = null;
    if (top !== null && scrollerRef.current) scrollerRef.current.scrollTop = top;
  }, [index]);

  function geometry(): Geometry | null {
    const scroller = scrollerRef.current;
    const sentinel = sentinelRef.current;
    if (!scroller || !sentinel) return null;
    const inset = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    const top = scroller.scrollTop + sentinel.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const sticky = Math.max(0, top - inset);
    const collapsed = scroller.scrollTop - sticky;
    return { sticky, collapsed: Math.max(0, collapsed), stuck: collapsed >= -STICKY_EPSILON_PX };
  }

  function rememberedTop(target: number): number {
    const tab = tabs[target];
    return tab && rememberedRef.current?.id === tab.id ? rememberedRef.current.top : 0;
  }

  function beginSlide(target: number, direction: 1 | -1): void {
    const geo = geometry();
    slideGeometryRef.current = geo;
    setMounted((prev) => (prev.includes(target) ? prev : [...prev, target]));
    setSlide({ target, direction });
    setPeek({ [target]: geo ? geo.collapsed - (geo.stuck ? rememberedTop(target) : 0) : 0 });
  }

  function commitTo(target: number): void {
    const geo = slideGeometryRef.current ?? geometry();
    const from = tabs[index];
    const to = tabs[target];
    if (geo && from && to) {
      const restore = geo.stuck ? rememberedTop(target) : 0;
      rememberedRef.current = { id: from.id, top: geo.collapsed };
      pendingScrollRef.current = geo.stuck ? geo.sticky + restore : null;
    }
    slideGeometryRef.current = null;
    setPeek({});
    setSlide(null);
    setIndex(target);
  }

  function settle(target: number | null, direction: 1 | -1, durationMs: number, easing: string): void {
    const pager = pagerRef.current;
    if (!pager) return;
    const token = parseFloat(getComputedStyle(pager).getPropertyValue('--dur-tab')) || 0;
    const duration = reducedMotion() ? token : durationMs;
    animatingRef.current = true;
    pager.style.setProperty('--slide-dur', `${duration}ms`);
    pager.style.setProperty('--slide-ease', easing);
    pager.dataset.animating = 'true';
    pager.style.setProperty('--dx', target === null ? '0px' : `${-direction * pager.offsetWidth}px`);
    if (settleRef.current !== null) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      settleRef.current = null;
      if (target !== null) {
        commitTo(target);
        return;
      }
      delete pager.dataset.animating;
      pager.style.setProperty('--dx', '0px');
      animatingRef.current = false;
      slideGeometryRef.current = null;
      setPeek({});
      setSlide(null);
    }, duration + SETTLE_SLACK_MS);
  }

  function selectTab(target: number): void {
    if (target === index || target < 0 || target >= tabs.length || animatingRef.current) return;
    const direction = target > index ? 1 : -1;
    const pager = pagerRef.current;
    const token = pager ? parseFloat(getComputedStyle(pager).getPropertyValue('--dur-tab')) || 0 : 0;
    beginSlide(target, direction);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => settle(target, direction, token, 'var(--ease-screen)')),
    );
  }

  function focusTab(target: number): void {
    rowRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    const target = index + step;
    if (target < 0 || target >= tabs.length) return;
    event.preventDefault();
    selectTab(target);
    focusTab(target);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (!swipeable || tabs.length < 2 || !event.isPrimary || event.pointerType === 'mouse') return;
    if (animatingRef.current) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      offset: 0,
      progress: 0,
      crossed: false,
      width: pagerRef.current?.offsetWidth ?? 1,
      target: null,
      direction: 1,
    };
  }

  useEffect(() => {
    function scheduleFrame(): void {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const drag = dragRef.current;
        if (drag) pagerRef.current?.style.setProperty('--dx', `${drag.offset}px`);
      });
    }

    function handleMove(event: globalThis.PointerEvent): void {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      if (drag.target === null) {
        if (Math.abs(dx) > SWIPE_LOCK_PX && Math.abs(dx) > SWIPE_DOMINANCE * Math.abs(dy)) {
          const direction = dx < 0 ? 1 : -1;
          const target = index + direction;
          if (target < 0 || target >= tabs.length) {
            dragRef.current = null;
            return;
          }
          drag.target = target;
          drag.direction = direction;
          drag.lastX = event.clientX;
          drag.lastTime = event.timeStamp;
          beginSlide(target, direction);
        } else if (Math.abs(dy) > SWIPE_LOCK_PX) {
          dragRef.current = null;
        }
        return;
      }

      const elapsed = event.timeStamp - drag.lastTime;
      if (elapsed > 0) drag.velocity = (event.clientX - drag.lastX) / elapsed;
      drag.lastX = event.clientX;
      drag.lastTime = event.timeStamp;
      const travelled = Math.max(-drag.width, Math.min(drag.width, dx));
      drag.offset = drag.direction === 1 ? Math.min(0, travelled) : Math.max(0, travelled);
      drag.progress = Math.abs(drag.offset) / drag.width;
      if (!drag.crossed && drag.progress >= SWIPE_THRESHOLD) {
        drag.crossed = true;
        haptic();
      }
      scheduleFrame();
    }

    function release(event: globalThis.PointerEvent, cancelled: boolean): void {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (drag.target === null) return;

      const direction = drag.direction;
      pagerRef.current?.style.setProperty('--dx', `${drag.offset}px`);

      const toward = -direction * drag.velocity;
      const flungOn = toward > SWIPE_VELOCITY;
      const flungOff = -toward > SWIPE_VELOCITY;
      const commit = !cancelled && (flungOn || (!flungOff && drag.progress > SWIPE_THRESHOLD));
      const speed = Math.max(SLIDE_MIN_SPEED, Math.abs(drag.velocity) * SLIDE_SPEED_SCALE);

      if (commit) {
        const remaining = drag.width * (1 - drag.progress);
        const duration = Math.min(SLIDE_MAX_MS, Math.max(SLIDE_MIN_MS, (remaining / speed) * 1000));
        settle(drag.target, direction, duration, SLIDE_EASE);
        return;
      }

      const remaining = drag.width * drag.progress;
      const duration = flungOff
        ? Math.min(SETTLE_MS, Math.max(SLIDE_MIN_MS, (remaining / speed) * 1000))
        : SETTLE_MS;
      settle(null, direction, duration, flungOff ? SLIDE_EASE : SETTLE_EASE);
    }

    function handleUp(event: globalThis.PointerEvent): void {
      release(event, false);
    }

    function handleCancel(event: globalThis.PointerEvent): void {
      release(event, true);
    }

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  });

  if (tabs.length === 0) return null;

  return (
    <div ref={sectionRef} className={styles.section}>
      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />

      <div
        ref={rowRef}
        className={`${styles.row} hide-native-scrollbar`}
        role="tablist"
        aria-label="Вложения чата"
        data-no-back-swipe="true"
        onKeyDown={handleTabKeyDown}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`chat-media-tab-${tab.id}`}
            aria-selected={i === index}
            aria-controls={`chat-media-panel-${tab.id}`}
            tabIndex={i === index ? 0 : -1}
            className={`${styles.tab} ${i === index ? styles.tabActive : ''}`}
            onClick={() => {
              selectTab(i);
              focusTab(i);
            }}
          >
            <span className={styles.tabPill}>{tab.label}</span>
          </button>
        ))}
      </div>

      <div
        ref={pagerRef}
        className={styles.pager}
        data-no-back-swipe={index > 0 ? 'true' : undefined}
        onPointerDown={handlePointerDown}
      >
        {tabs.map((tab, i) => {
          if (i !== index && !mounted.includes(i)) return null;
          const slot = slide?.target === i ? slide.direction : i - index;
          const offset = peek[i] ?? 0;
          return (
            <div
              key={tab.id}
              id={`chat-media-panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`chat-media-tab-${tab.id}`}
              className={`${styles.panel} ${slot === 0 ? styles.panelActive : ''}`}
              hidden={slot !== 0 && slide?.target !== i}
              style={
                slot === 0
                  ? { transform: 'translate3d(var(--dx), 0, 0)' }
                  : { transform: `translate3d(calc(${slot * 100}% + var(--dx)), ${offset}px, 0)` }
              }
            >
              {tab.id === 'media' ? <MediaTabGrid chatId={chatId} /> : <p className={styles.soon}>Скоро</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
