import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useEscapeKey } from '../app/hotkeys';
import { registerOverlayBackGesture, useBackHandler } from '../app/useBackHandler';
import { useLayoutMode } from '../app/useLayoutMode';
import { ScrollIndicator } from './ScrollIndicator';
import styles from './Sheet.module.css';

interface SheetProps {
  title?: string;
  /** Короткое пояснение под заголовком — часть шапки, не прокручивается вместе с телом. */
  subtitle?: ReactNode;
  onClose: () => void;
  /** Кнопка справа от заголовка. */
  action?: ReactNode;
  children: ReactNode;
}

/** Ниже этой доли высоты шит доезжает обратно, выше — закрывается. */
const CLOSE_RATIO = 0.4;
/** Скорость броска (px/мс), при которой шит закрывается независимо от пройденного пути. */
const FLING_VELOCITY = 0.6;
/** Доля высоты шита, на которую он уезжает за полным прогрессом системного жеста «назад». */
const SYSTEM_BACK_TRAVEL = 0.35;
/** Доводка после отпускания: медленнее этого (px/мс) шит не уезжает, и границы длительности. */
const CLOSE_MIN_SPEED = 1.2;
const CLOSE_MIN_MS = 120;
const CLOSE_MAX_MS = 320;

type Phase = 'open' | 'dragging' | 'settling' | 'closing';

/** Боттом-шит: перетаскивание вниз с инерцией, закрытие по Escape, скриму и броску.
 *  Один из четырёх разрешённых размывающих слоёв. */
export function Sheet({ title, subtitle, onClose, action, children }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('open');
  // Въезд снизу играется один раз. Раньше `rise` висел на самом шите, а `.dragging`/`.settling`
  // гасили анимацию целиком — и как только шит возвращался в состояние покоя, анимация
  // запускалась заново: доехав обратно, он снова прыгал снизу (R-33A, найдено пользователем).
  const [entering, setEntering] = useState(true);
  const desktop = useLayoutMode() === 'desktop';

  // Жест живёт в ref, а не в состоянии: перерисовывать на каждое движение пальца незачем.
  const gesture = useRef({ active: false, startY: 0, lastY: 0, lastTime: 0, velocity: 0 });

  /** Длительность доводки, когда шит уходит жестом: закрытие продолжает движение пальца,
   *  а не подменяет его своей анимацией с нуля. */
  const flingCloseMs = useRef<number | null>(null);

  const startClose = useCallback(() => {
    setPhase((current) => (current === 'closing' ? current : 'closing'));
  }, []);

  /** Отпустили за порогом: шит доезжает вниз из того места, где его оставил палец, со
   *  скоростью броска — как экран в свайпе назад. Раньше он мгновенно ставился вниз и
   *  только потом играл свою анимацию, из-за чего просто исчезал (R-33A, замечание
   *  пользователя). */
  const flingClose = useCallback(
    (fromPx: number, velocity: number) => {
      const element = sheetRef.current;
      const height = element?.offsetHeight ?? 0;
      const remaining = Math.max(0, height - fromPx);
      const speed = Math.max(CLOSE_MIN_SPEED, Math.abs(velocity));
      const duration = Math.min(CLOSE_MAX_MS, Math.max(CLOSE_MIN_MS, remaining / speed));

      flingCloseMs.current = duration;
      if (element) {
        element.style.transition = `transform ${Math.round(duration)}ms var(--ease-close)`;
        element.style.transform = `translateY(${height}px)`;
      }
      startClose();
    },
    [startClose],
  );

  useBackHandler(phase !== 'closing', startClose);
  useEscapeKey(phase !== 'closing', startClose);


  useEffect(() => {
    const ms = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-menu')) || 0;
    const timer = window.setTimeout(() => setEntering(false), ms + 50);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== 'closing') return;
    const token = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-close')) || 0;
    const timer = window.setTimeout(onClose, flingCloseMs.current ?? token);
    return () => window.clearTimeout(timer);
  }, [phase, onClose]);

  /** Едет только рамка. Размытие лежит на скриме, который не двигается вообще, поэтому
   *  размытая картинка остаётся на месте экрана сама собой — пересчитывать нечего и
   *  догонять нечему (ux-ui/motion-cost.md; решение пользователя). */
  function offsetTo(px: number): void {
    if (sheetRef.current) sheetRef.current.style.transform = px > 0 ? `translateY(${px}px)` : '';
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (phase === 'closing') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      active: true,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
    };
    setPhase('dragging');
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const g = gesture.current;
    if (!g.active) return;
    const elapsed = event.timeStamp - g.lastTime;
    if (elapsed > 0) g.velocity = (event.clientY - g.lastY) / elapsed;
    g.lastY = event.clientY;
    g.lastTime = event.timeStamp;
    // Вверх шит не тянется — только вниз.
    offsetTo(Math.max(0, event.clientY - g.startY));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const g = gesture.current;
    if (!g.active) return;
    g.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);

    const travelled = Math.max(0, g.lastY - g.startY);
    const height = sheetRef.current?.offsetHeight ?? 0;
    const flung = g.velocity > FLING_VELOCITY;

    if (flung || travelled > height * CLOSE_RATIO) {
      flingClose(travelled, g.velocity);
      return;
    }

    setPhase('settling');
    offsetTo(0);
  }

  // Системный жест «назад» ведёт шит так же, как палец: за прогрессом жеста едет transform,
  // на `invoke` шит уходит. Ничего не пересчитывается — только смещение (ux-ui/motion-cost.md).
  useEffect(() => {
    if (desktop) return;
    // Высота меряется один раз на входе в жест: читать offsetHeight каждый кадр — это и есть
    // пересчёт раскладки в середине движения (ux-ui/motion-cost.md).
    let height = 0;
    return registerOverlayBackGesture({
      progress: (ratio) => {
        if (height === 0) {
          height = sheetRef.current?.offsetHeight ?? 0;
          setPhase((current) => (current === 'closing' ? current : 'dragging'));
        }
        offsetTo(height * ratio * SYSTEM_BACK_TRAVEL);
      },
      settle: (committed) => {
        const travelled = height * SYSTEM_BACK_TRAVEL;
        height = 0;
        if (committed) {
          flingClose(travelled, 0);
          return;
        }
        setPhase('settling');
        offsetTo(0);
      },
    });
  }, [desktop, flingClose]);

  const sheetClass = [
    styles.sheet,
    entering ? styles.entering : '',
    desktop ? styles.dialog : '',
    phase === 'dragging' ? styles.dragging : '',
    phase === 'settling' ? styles.settling : '',
    phase === 'closing' && flingCloseMs.current === null
      ? desktop
        ? styles.dialogClosing
        : styles.sheetClosing
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <>
      <div
        className={`${styles.scrim} ${desktop ? styles.scrimPlain : ''} ${phase === 'closing' ? styles.scrimClosing : ''}`}
        style={
          phase === 'closing' && flingCloseMs.current !== null
            ? { animationDuration: `${Math.round(flingCloseMs.current)}ms` }
            : undefined
        }
        onClick={startClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className={sheetClass}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onTransitionEnd={() => setPhase((current) => (current === 'settling' ? 'open' : current))}
      >
        {/* Тянется вся шапка, а не только пилюля: за 28 px ручки попасть пальцем трудно
            (R-33A, замечание пользователя). */}
        <div
          className={styles.header}
          onPointerDown={desktop ? undefined : handlePointerDown}
          onPointerMove={desktop ? undefined : handlePointerMove}
          onPointerUp={desktop ? undefined : handlePointerUp}
          onPointerCancel={desktop ? undefined : handlePointerUp}
        >
          {!desktop && (
            <div className={styles.grip}>
              <span className={styles.gripBar} />
            </div>
          )}
          {(title || action) && (
            <div className={styles.titleRow}>
              {title && <h2 className={styles.title}>{title}</h2>}
              {action}
            </div>
          )}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <div ref={bodyRef} className={`${styles.body} hide-native-scrollbar`}>
          <ScrollIndicator target={bodyRef} />
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
