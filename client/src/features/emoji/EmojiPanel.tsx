import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useBackHandler } from '../../app/useBackHandler';
import { haptic } from '../../ui/haptic';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import { SearchField } from '../../ui/SearchField';
import { EmojiCategories } from './EmojiCategories';
import { EmojiGrid } from './EmojiGrid';
import { buildEmojiLayout, type EmojiSection } from './emojiLayout';
import { useEmojiIndex, type EmojiEntry, type EmojiIndex } from './emojiIndex';
import { useEmojiUsageStore } from './emojiUsageStore';
import styles from './EmojiPanel.module.css';

type PanelTab = 'emoji' | 'stickers' | 'gif';

interface EmojiPanelProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

function buildSections(index: EmojiIndex | null | undefined, recent: string[], query: string): EmojiSection[] {
  if (!index) return [];

  const trimmed = query.trim().toLowerCase();
  if (trimmed) {
    const flat = index.emoji.filter((entry) => entry.k.some((keyword) => keyword.includes(trimmed)));
    return flat.length > 0 ? [{ label: '', entries: flat }] : [];
  }

  const sections: EmojiSection[] = [];

  const recentEntries = recent
    .map((char) => index.byChar.get(char))
    .filter((entry): entry is EmojiEntry => Boolean(entry));
  if (recentEntries.length > 0) sections.push({ label: 'Недавние', entries: recentEntries });

  index.categories.forEach((label, categoryIndex) => {
    const entries = index.emoji.filter((entry) => entry.c === categoryIndex);
    if (entries.length > 0) sections.push({ label, entries });
  });

  return sections;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface DragState {
  active: boolean;
  startScrollTop: number;
  startCategoryHidden: number;
  startTabsHidden: number;
}

const SETTLE_DUR_MS = 500;

export function EmojiPanel({ onSelect, onClose }: EmojiPanelProps) {
  const index = useEmojiIndex();
  const recent = useEmojiUsageStore((s) => s.recent);
  const recordUsage = useEmojiUsageStore((s) => s.recordUsage);

  const [tab, setTab] = useState<PanelTab>('emoji');
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);
  const [closing, setClosing] = useState(false);

  const [dragging, setDragging] = useState(false);
  const [categoryHiddenPx, setCategoryHiddenPx] = useState(0);
  const [tabsHiddenPx, setTabsHiddenPx] = useState(0);
  const [categoryNaturalH, setCategoryNaturalH] = useState(0);
  const [tabsNaturalH, setTabsNaturalH] = useState(0);

  const bodyRef = useRef<HTMLDivElement>(null);
  const categoryInnerRef = useRef<HTMLDivElement>(null);
  const tabsInnerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const scrollFrame = useRef(0);

  const sections = useMemo(() => buildSections(index, recent, query), [index, recent, query]);
  const layout = useMemo(() => buildEmojiLayout(sections), [sections]);
  const showCategories = query.trim().length === 0;

  function startClose(): void {
    setClosing((current) => current || true);
  }

  useEffect(() => {
    if (!closing) return;
    const ms = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-close')) || 0;
    const timer = window.setTimeout(onClose, ms);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  useBackHandler(!closing, startClose);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') startClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const el = categoryInnerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setCategoryNaturalH((entry.target as HTMLElement).offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [showCategories]);

  useEffect(() => {
    const el = tabsInnerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setTabsNaturalH((entry.target as HTMLElement).offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
    };
  }, []);

  function handleSelect(emoji: string): void {
    haptic();
    recordUsage(emoji);
    onSelect(emoji);
  }

  function handleCategorySelect(categoryIndex: number): void {
    setActiveCategory(categoryIndex);
    setCategoryHiddenPx(0);
    setTabsHiddenPx(0);
    const container = bodyRef.current;
    const anchorRow = layout.sectionAnchorRow[categoryIndex];
    const offset = anchorRow != null ? layout.offsets[anchorRow] : undefined;
    if (!container || offset == null) return;
    container.scrollTo({ top: offset, behavior: 'smooth' });
  }

  function handleVisibleSectionChange(sectionIndex: number): void {
    setActiveCategory(sectionIndex);
  }

  function handleBodyTouchStart(): void {
    dragRef.current = {
      active: true,
      startScrollTop: bodyRef.current?.scrollTop ?? 0,
      startCategoryHidden: categoryHiddenPx,
      startTabsHidden: tabsHiddenPx,
    };
    setDragging(true);
  }

  function settleDrag(): void {
    if (!dragRef.current?.active) return;
    dragRef.current.active = false;
    setDragging(false);
    setCategoryHiddenPx((h) => (h > categoryNaturalH / 2 ? categoryNaturalH : 0));
    setTabsHiddenPx((h) => (h > tabsNaturalH / 2 ? tabsNaturalH : 0));
  }

  function handleBodyScroll(): void {
    const el = bodyRef.current;
    if (!el) return;

    if (el.scrollTop <= 0) {
      setCategoryHiddenPx(0);
      setTabsHiddenPx(0);
      return;
    }

    const drag = dragRef.current;
    if (!drag?.active) return;
    if (scrollFrame.current) return;

    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const delta = el.scrollTop - drag.startScrollTop;
      setCategoryHiddenPx(clamp(drag.startCategoryHidden + delta, 0, categoryNaturalH));
      setTabsHiddenPx(clamp(drag.startTabsHidden + delta, 0, tabsNaturalH));
    });
  }

  function stopPointerBubble(event: React.PointerEvent): void {
    event.stopPropagation();
  }

  const revealTransition = dragging ? 'none' : `height ${SETTLE_DUR_MS}ms var(--ease-screen)`;

  return createPortal(
    <div
      onPointerDown={stopPointerBubble}
      onPointerMove={stopPointerBubble}
      onPointerUp={stopPointerBubble}
      onPointerCancel={stopPointerBubble}
    >
      <div className={styles.catcher} onClick={startClose} aria-hidden="true" />

      <div
        className={`${styles.panel} ${closing ? styles.panelClosing : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Эмодзи"
      >
        <div
          className={styles.categoryWrap}
          style={{
            height: Math.max(0, categoryNaturalH - categoryHiddenPx),
            transition: categoryNaturalH === 0 ? 'none' : revealTransition,
          }}
        >
          <div ref={categoryInnerRef} style={{ transform: `translateY(-${categoryHiddenPx}px)` }}>
            {showCategories && (
              <EmojiCategories
                labels={sections.map((s) => s.label)}
                activeIndex={activeCategory}
                onSelect={handleCategorySelect}
              />
            )}
          </div>
        </div>

        <div
          ref={bodyRef}
          className={`${styles.body} hide-native-scrollbar`}
          onScroll={handleBodyScroll}
          onTouchStart={handleBodyTouchStart}
          onTouchEnd={settleDrag}
          onTouchCancel={settleDrag}
        >
          <ScrollIndicator target={bodyRef} />
          <div className={styles.searchRow}>
            <SearchField value={query} onChange={setQuery} placeholder="Поиск эмодзи" autoFocus={false} />
          </div>
          {tab === 'emoji' ? (
            <EmojiGrid
              layout={layout}
              containerRef={bodyRef}
              onSelect={handleSelect}
              onVisibleSectionChange={handleVisibleSectionChange}
            />
          ) : (
            <p className={styles.stub}>Скоро</p>
          )}
        </div>

        <div
          className={styles.tabsWrap}
          style={{
            height: Math.max(0, tabsNaturalH - tabsHiddenPx),
            transition: tabsNaturalH === 0 ? 'none' : revealTransition,
          }}
        >
          <div ref={tabsInnerRef} className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'emoji' ? styles.tabActive : ''}`}
              onClick={() => setTab('emoji')}
            >
              Эмодзи
            </button>
            <button type="button" className={styles.tab} disabled title="Скоро" aria-disabled="true">
              Стикеры
            </button>
            <button type="button" className={styles.tab} disabled title="Скоро" aria-disabled="true">
              GIF
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
