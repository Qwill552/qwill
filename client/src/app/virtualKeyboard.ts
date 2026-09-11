import { Capacitor, registerPlugin } from '@capacitor/core';

interface VirtualKeyboard extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRectReadOnly;
}

type NavigatorWithVirtualKeyboard = Navigator & {
  virtualKeyboard?: VirtualKeyboard;
};

export type KeyboardPhase = 'start' | 'end';

export interface KeyboardState {
  /** Подъём, на который пересчитана раскладка: отступ ленты и её прокрутка. */
  liftLayout: number;
  /** Подъём в конце начавшегося движения. Совпадает с `liftLayout` при появлении. */
  liftTo: number;
  phase: KeyboardPhase;
}

/** `chrome` едет вверх вместе с клавиатурой, `feed` — отстаёт от уже пересчитанной
 *  раскладки ровно на то, что клавиатуре осталось пройти. */
export type KeyboardMoverMode = 'chrome' | 'feed';

interface KeyboardInsetsPlugin {
  addListener(
    eventName: 'keyboardInset',
    listener: (event: {
      phase: KeyboardPhase;
      height: number;
      target?: number;
      duration?: number;
      easing?: string;
    }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

function virtualKeyboard(): VirtualKeyboard | undefined {
  return (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;
}

const SAFE_SETTLE_MS = 600;
const FALLBACK_DURATION_MS = 250;
const FALLBACK_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

const listeners = new Set<(state: KeyboardState) => void>();
const movers = new Map<HTMLElement, KeyboardMoverMode>();
const running = new Set<Animation>();

/** Считается сразу, а не по факту первого события: иначе visualViewport успевает
 *  опередить нативный мост и опубликовать конечную высоту до начала движения. */
const hasNativeInsets = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('QwillKeyboard');

let layoutLift = 0;
let liveLift = 0;
let keyboardHeight = 0;
let heldSafeBottom = -1;
let safeProbe: HTMLElement | null = null;
let safeTimer: number | undefined;

export function onKeyboardState(listener: (state: KeyboardState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Элемент, который должен ехать вместе с клавиатурой. Движение проигрывает композитор по
 *  длительности и кривой самой клавиатуры — за кадр не выполняется ни строчки скрипта. */
export function registerKeyboardMover(el: HTMLElement, mode: KeyboardMoverMode): () => void {
  movers.set(el, mode);
  return () => {
    movers.delete(el);
  };
}

function viewportHeight(): number {
  return Math.max(window.innerHeight, document.documentElement.clientHeight);
}

function readSafeBottom(): number {
  if (!safeProbe) {
    safeProbe = document.createElement('div');
    safeProbe.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;pointer-events:none;height:env(safe-area-inset-bottom,0px)';
    document.body.append(safeProbe);
  }
  return Math.round(parseFloat(getComputedStyle(safeProbe).height)) || 0;
}

/** Полоска жестов гаснет раньше, чем поедет клавиатура, и возвращается раньше, чем та
 *  опустится. Перечитываем её только когда всё успокоилось: иначе композер шатнётся на
 *  её высоту в начале и в конце движения. */
function scheduleSafeBottomHold(): void {
  window.clearTimeout(safeTimer);
  safeTimer = window.setTimeout(() => {
    if (keyboardHeight > 0) return;
    const value = readSafeBottom();
    if (value === heldSafeBottom) return;
    heldSafeBottom = value;
    document.documentElement.style.setProperty('--safe-bottom-hold', `${value}px`);
  }, SAFE_SETTLE_MS);
}

function lift(height: number): number {
  return Math.max(0, height - Math.max(heldSafeBottom, 0));
}

function offsetOf(mode: KeyboardMoverMode, atLift: number): number {
  return mode === 'chrome' ? -atLift : layoutLift - atLift;
}

function stopMoving(): void {
  for (const animation of running) animation.cancel();
  running.clear();
}

/** Одна анимация на элемент, на всё движение. Значения задаются абсолютные, заливки нет:
 *  по окончании элемент остаётся на том, что уже написано в CSS. */
function startMoving(fromLift: number, toLift: number, duration: number, easing: string): void {
  stopMoving();
  if (duration <= 0 || fromLift === toLift) return;

  for (const [el, mode] of movers) {
    const from = offsetOf(mode, fromLift);
    const to = offsetOf(mode, toLift);
    if (from === to) continue;
    const animation = el.animate(
      [{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }],
      { duration, easing, fill: 'none' },
    );
    running.add(animation);
    animation.finished.catch(() => undefined).finally(() => running.delete(animation));
  }
}

function writeVariables(nextLayoutLift: number, nextLiveLift: number, height: number): void {
  const root = document.documentElement;
  layoutLift = nextLayoutLift;
  liveLift = nextLiveLift;
  keyboardHeight = height;

  if (height > 0 || nextLayoutLift > 0) root.dataset.keyboard = 'up';
  root.style.setProperty('--keyboard-lift', `${nextLayoutLift}px`);
  root.style.setProperty('--keyboard-lift-live', `${nextLiveLift}px`);
  // Снять признак в этом же кадре нельзя: стиль считается один раз, в конце задачи, и
  // увидит уже снятый признак — а значит вернёт переход на отступ ленты ровно на то
  // изменение, ради которого он и выключался.
  if (height === 0 && nextLayoutLift === 0) {
    requestAnimationFrame(() => {
      if (keyboardHeight === 0 && layoutLift === 0) delete root.dataset.keyboard;
    });
  }
}

function notify(phase: KeyboardPhase, liftTo: number): void {
  const state: KeyboardState = { liftLayout: layoutLift, liftTo, phase };
  for (const listener of listeners) listener(state);
}

function revealFocused(height: number): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  const editable =
    active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  if (!editable) return;

  if (active.getBoundingClientRect().bottom > viewportHeight() - height) {
    active.scrollIntoView({ block: 'center' });
    return;
  }
  window.scrollTo(0, 0);
}

/** Оболочка и браузер сообщают о клавиатуре по-разному, и ровно одним способом каждый.
 *  В WebView сжимается визуальный вьюпорт, а `boundingRect` пуст; в Chrome вьюпорт не
 *  шевелится вовсе, зато честен `boundingRect`. Берём наибольшее из двух. */
function webKeyboardHeight(): number {
  const viewport = window.visualViewport;
  const fromViewport = viewport ? viewportHeight() - viewport.height * viewport.scale : 0;
  const fromApi = virtualKeyboard()?.boundingRect.height ?? 0;
  return Math.max(0, fromViewport, fromApi);
}

function watchWebSources(): void {
  const onChange = (): void => {
    scheduleSafeBottomHold();
    if (hasNativeInsets) return;
    const height = Math.round(webKeyboardHeight());
    if (height === keyboardHeight) return;
    writeVariables(lift(height), lift(height), height);
    notify('end', lift(height));
    if (height > 0) revealFocused(height);
  };

  window.visualViewport?.addEventListener('resize', onChange);
  window.visualViewport?.addEventListener('scroll', onChange);
  virtualKeyboard()?.addEventListener('geometrychange', onChange);
  onChange();
}

async function watchNativeInsets(): Promise<void> {
  if (!hasNativeInsets) return;

  const plugin = registerPlugin<KeyboardInsetsPlugin>('QwillKeyboard');
  await plugin.addListener('keyboardInset', (event) => {
    if (event.phase === 'start') {
      const target = Math.round(event.target ?? 0);
      const fromLift = liveLift;
      const toLift = lift(target);
      // Пока клавиатура едет, раскладка стоит на большем из двух концов: на убирании
      // отнятый отступ было бы нечем компенсировать — прокрутка упёрлась бы в конец.
      writeVariables(Math.max(layoutLift, toLift), toLift, Math.max(keyboardHeight, target));
      notify('start', toLift);
      startMoving(fromLift, toLift, event.duration ?? FALLBACK_DURATION_MS, event.easing || FALLBACK_EASING);
      return;
    }

    stopMoving();
    const height = Math.round(event.height);
    writeVariables(lift(height), lift(height), height);
    notify('end', lift(height));
    scheduleSafeBottomHold();
    if (height > 0) revealFocused(height);
  });
}

export function initVirtualKeyboard(): void {
  const keyboard = virtualKeyboard();
  if (keyboard) keyboard.overlaysContent = true;

  heldSafeBottom = readSafeBottom();
  document.documentElement.style.setProperty('--safe-bottom-hold', `${heldSafeBottom}px`);

  watchWebSources();
  void watchNativeInsets();
}
