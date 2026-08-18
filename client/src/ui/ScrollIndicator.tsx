import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

import styles from './ScrollIndicator.module.css';

/** Длина овала по умолчанию (до чтения --scrollbar-thumb-h из tokens.css) — фиксированная,
 *  не зависит от объёма контента (решение пользователя, как в референсе Telegram: одна и та
 *  же длина, двигается только позиция). */
const DEFAULT_THUMB_LENGTH = 20;
/** Сколько ждать после остановки скролла/перетаскивания, прежде чем спрятать индикатор. */
const HIDE_DELAY_MS = 900;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ScrollIndicatorProps {
  /** Скроллящийся элемент, к которому привязан индикатор. */
  target: RefObject<HTMLElement | null>;
  /** 'full' — трек на всю видимую высоту контейнера. 'bounded' — трек между boundsTop
   *  и boundsBottom, фиксирован по разметке и не зависит от длины страницы. */
  mode?: 'full' | 'bounded';
  /** Только для mode='bounded': элементы, чьи верхняя и нижняя грани задают трек. */
  boundsTop?: RefObject<HTMLElement | null>;
  boundsBottom?: RefObject<HTMLElement | null>;
  /** Перетаскивание ползунка пальцем/мышью — только там, где это явно включено (лента чата). */
  interactive?: boolean;
}

/** Минималистичный индикатор прокрутки поверх спрятанного нативного скроллбара: овал без
 *  подложки и трека, прозрачный по умолчанию, проявляется на время скролла/перетаскивания.
 *  Рендерится sticky-потомком самого скроллящегося элемента — так его позиция и анимация
 *  входа/выхода экрана следуют за контейнером сами, без измерения через getBoundingClientRect
 *  относительно окна (см. ux-ui.md, ад-хок редизайн «минималистичный скроллбар»). */
export function ScrollIndicator({ target, mode = 'full', boundsTop, boundsBottom, interactive = false }: ScrollIndicatorProps) {
  const [offset, setOffset] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(DEFAULT_THUMB_LENGTH);
  const [visible, setVisible] = useState(false);
  /* Отступ сверху для .track (px): в 'full' режиме равен padding-top скроллера, чтобы трек
   * не заезжал в зону, зарезервированную под плавающую хрому (шапку/композер) — та лежит
   * поверх контента с более высоким z-index, и без отступа индикатор оказывался бы под ней,
   * невидимым (найдено на живом скриншоте: индикатор не показывался в ленте чата). */
  const [stickyTop, setStickyTop] = useState(0);
  /* Насколько сдвинуть овал вправо от --scrollbar-edge (обычно отрицательное число): без
   * этого он прижимался бы к краю ТЕКСТОВОГО блока внутри скроллера (его собственный
   * padding-right, 10-14px), а не к физическому краю экрана — баг со скриншота пользователя. */
  const [thumbRight, setThumbRight] = useState('var(--scrollbar-edge)');
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const range = useRef({ top: 0, height: 0 });
  const dragging = useRef<{ startY: number; startScrollTop: number } | null>(null);

  useEffect(() => {
    // node — отдельная переменная с не-nullable типом (а не просто суженный target.current):
    // замыкания ниже объявлены отдельными function-выражениями, и TS не переносит в них
    // сужение типа по `if`, только собственный статический тип переменной.
    const maybeNode = target.current;
    if (!maybeNode) return;
    const node: HTMLElement = maybeNode;

    // Читается один раз: --scrollbar-thumb-h — простой литерал токена (без var()/env()
    // внутри), getComputedStyle на кастомном свойстве возвращает его как есть надёжно.
    const thumbLength =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scrollbar-thumb-h')) ||
      DEFAULT_THUMB_LENGTH;

    /* Место под плавающую хрому контент берёт себе в padding (design-system.md, «Плавающая
     * хрома») — читаем его у самого скроллера, а не у каждого экрана отдельно: работает
     * одинаково для шапки чата, композера, таб-бара и любых будущих плавающих панелей. */
    function fullModeInsets(): { top: number; bottom: number } {
      const cs = getComputedStyle(node);
      return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    }

    // --scrollbar-edge уже включает --safe-right (см. tokens.css) — здесь нужно только
    // вычесть СОБСТВЕННЫЙ правый padding скроллера (текстовые поля экрана), чтобы овал
    // «пробился» сквозь него к физическому краю. paddingRight скроллера обычно уже сам
    // включает --safe-right, поэтому итоговое смещение чаще всего отрицательное.
    function measureEdge(): void {
      const padRight = parseFloat(getComputedStyle(node).paddingRight) || 0;
      setThumbRight(padRight > 0 ? `calc(var(--scrollbar-edge) - ${padRight}px)` : 'var(--scrollbar-edge)');
    }

    function measureRange(): void {
      if (mode === 'bounded' && boundsTop?.current && boundsBottom?.current) {
        const containerTop = node.getBoundingClientRect().top;
        const top = boundsTop.current.getBoundingClientRect().top - containerTop + node.scrollTop;
        const bottom = boundsBottom.current.getBoundingClientRect().bottom - containerTop + node.scrollTop;
        range.current = { top, height: Math.max(0, bottom - top) };
        setStickyTop(0);
      } else {
        const insets = fullModeInsets();
        range.current = { top: 0, height: Math.max(0, node.clientHeight - insets.top - insets.bottom) };
        setStickyTop(insets.top);
      }
      measureEdge();
      update();
    }

    function update(): void {
      const max = node.scrollHeight - node.clientHeight;
      const ratio = max > 0 ? clamp(node.scrollTop / max, 0, 1) : 0;
      const height = Math.min(thumbLength, range.current.height || thumbLength);
      setThumbHeight(height);
      setOffset(range.current.top + ratio * Math.max(0, range.current.height - height));
    }

    function handleScroll(): void {
      // Верхний/нижний паддинг 'full'-режима бывает динамическим (например, --composer-h
      // растёт вместе с текстом в поле ввода) — пересчитываем на каждый скролл, а не
      // только при монтировании: дешевле, чем городить отдельное наблюдение за композером.
      if (mode !== 'bounded') {
        const insets = fullModeInsets();
        range.current = { top: 0, height: Math.max(0, node.clientHeight - insets.top - insets.bottom) };
        setStickyTop(insets.top);
      }
      update();
      setVisible(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    }

    measureRange();
    node.addEventListener('scroll', handleScroll, { passive: true });

    const observed = [node, boundsTop?.current, boundsBottom?.current].filter((n): n is HTMLElement => !!n);
    const ro = new ResizeObserver(() => measureRange());
    observed.forEach((n) => ro.observe(n));

    return () => {
      node.removeEventListener('scroll', handleScroll);
      ro.disconnect();
      clearTimeout(hideTimer.current);
    };
  }, [target, mode, boundsTop, boundsBottom]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const el = target.current;
    if (!interactive || !el) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Синтетический pointerId бывает уже неактивен с точки зрения браузера — не критично
      // (та же защита, что и в ScreenStack.handlePointerDown).
    }
    dragging.current = { startY: event.clientY, startScrollTop: el.scrollTop };
    setVisible(true);
    clearTimeout(hideTimer.current);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const el = target.current;
    const g = dragging.current;
    if (!g || !el) return;
    const max = el.scrollHeight - el.clientHeight;
    // Дистанция перетаскивания считается по тому же (возможно уменьшенному отступами
    // хромы) диапазону, что и визуальное положение ползунка (range.current.height) —
    // иначе жест и видимое движение ползунка расходились бы у краёв трека.
    const usable = Math.max(1, range.current.height - thumbHeight);
    const deltaScroll = ((event.clientY - g.startY) / usable) * max;
    el.scrollTop = clamp(g.startScrollTop + deltaScroll, 0, max);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging.current) return;
    dragging.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // См. handlePointerDown.
    }
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  }

  return (
    <div className={styles.track} style={{ top: stickyTop }} aria-hidden="true">
      <div
        className={`${styles.thumb} ${visible ? styles.visible : ''} ${interactive ? styles.interactive : ''}`}
        style={{ height: thumbHeight, right: thumbRight, transform: `translateY(${offset}px)` }}
        data-no-back-swipe
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
