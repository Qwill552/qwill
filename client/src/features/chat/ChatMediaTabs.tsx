import type { ChatAttachmentCategory, ChatAttachmentCounts } from '@messenger/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { getChatAttachmentCountsRequest } from '../../api/chats';
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
const COMMIT_RATIO = 0.28;
const COMMIT_VELOCITY = 0.45;
const SETTLE_SLACK_MS = 40;
const VELOCITY_WINDOW_MS = 40;

interface Geometry {
  scroller: HTMLElement;
  sticky: number;
  collapsed: number;
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  width: number;
  target: number | null;
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
    },
    [onHeaderLabel],
  );

  useEffect(() => {
    const row = rowRef.current;
    const button = row?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index];
    if (!row || !button) return;
    const left = button.offsetLeft - (row.clientWidth - button.offsetWidth) / 2;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
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
    const section = sectionRef.current;
    const row = rowRef.current;
    if (!scroller || !section || !row) return null;
    const inset = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    const sectionTop = scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const sticky = Math.max(0, sectionTop + row.offsetTop - inset);
    return { scroller, sticky, collapsed: Math.max(0, scroller.scrollTop - sticky) };
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
    setPeek({ [target]: geo ? geo.collapsed - (geo.collapsed > 0 ? rememberedTop(target) : 0) : 0 });
  }

  function commitTo(target: number): void {
    const geo = slideGeometryRef.current ?? geometry();
    const from = tabs[index];
    const to = tabs[target];
    if (geo && from && to) {
      const restore = geo.collapsed > 0 ? rememberedTop(target) : 0;
      rememberedRef.current = { id: from.id, top: geo.collapsed };
      pendingScrollRef.current = geo.collapsed > 0 ? geo.sticky + restore : null;
    }
    slideGeometryRef.current = null;
    setPeek({});
    setSlide(null);
    setIndex(target);
  }

  function settle(target: number | null, direction: 1 | -1): void {
    const pager = pagerRef.current;
    if (!pager) return;
    animatingRef.current = true;
    pager.dataset.animating = 'true';
    pager.style.setProperty('--dx', target === null ? '0px' : `${-direction * pager.offsetWidth}px`);
    const duration = parseFloat(getComputedStyle(pager).getPropertyValue('--dur-tab')) || 0;
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
    beginSlide(target, direction);
    requestAnimationFrame(() => requestAnimationFrame(() => settle(target, direction)));
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
      width: pagerRef.current?.offsetWidth ?? 1,
      target: null,
    };
  }

  useEffect(() => {
    function paint(dx: number): void {
      pagerRef.current?.style.setProperty('--dx', `${dx}px`);
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
          beginSlide(target, direction);
        } else if (Math.abs(dy) > SWIPE_LOCK_PX) {
          dragRef.current = null;
        }
        return;
      }

      if (event.timeStamp - drag.lastTime > VELOCITY_WINDOW_MS) {
        drag.lastX = event.clientX;
        drag.lastTime = event.timeStamp;
      }
      paint(Math.max(-drag.width, Math.min(drag.width, dx)));
    }

    function release(event: globalThis.PointerEvent, cancelled: boolean): void {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      if (drag.target === null) return;
      const direction: 1 | -1 = drag.target > index ? 1 : -1;
      const dx = event.clientX - drag.startX;
      const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
      const velocity = (event.clientX - drag.lastX) / elapsed;
      const flung = Math.abs(velocity) > COMMIT_VELOCITY && Math.sign(velocity) === Math.sign(dx);
      const passed = Math.abs(dx) > drag.width * COMMIT_RATIO || flung;
      settle(!cancelled && passed ? drag.target : null, direction);
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
              hidden={slot !== 0 && slide === null}
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
