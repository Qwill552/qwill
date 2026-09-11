import { Capacitor, registerPlugin } from '@capacitor/core';

interface VirtualKeyboard extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRectReadOnly;
}

type NavigatorWithVirtualKeyboard = Navigator & {
  virtualKeyboard?: VirtualKeyboard;
};

export type BottomInsetPhase = 'start' | 'end';

export interface BottomInsetState {
  layoutShift: number;
  phase: BottomInsetPhase;
}

/** `chrome` едет вверх вместе с клавиатурой, `feed` — отстаёт от уже пересчитанной
 *  раскладки ровно на то, что клавиатуре осталось пройти. */
export type InsetMoverMode = 'chrome' | 'feed';

interface KeyboardInsetsPlugin {
  addListener(
    eventName: 'keyboardInset',
    listener: (event: {
      phase: BottomInsetPhase;
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

const RESTING_LIFT = 0;
const SAFE_SETTLE_MS = 600;
const FALLBACK_DURATION_MS = 250;
const FALLBACK_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const SETTLE_MARGIN_MS = 80;
const PANEL_LIFT_KEY = 'qwill.panel-lift';

const listeners = new Set<(state: BottomInsetState) => void>();
const movers = new Map<HTMLElement, InsetMoverMode>();
const running = new Set<Animation>();

/** Считается сразу, а не по факту первого события: иначе visualViewport успевает
 *  опередить нативный мост и опубликовать конечную высоту до начала движения. */
const hasNativeInsets = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('QwillKeyboard');

let layoutLift = 0;
let liveLift = 0;
let keyboardHeight = 0;
let panelOpen = false;
let panelLift = 0;
let heldSafeBottom = -1;
let safeProbe: HTMLElement | null = null;
let panelProbe: HTMLElement | null = null;
let safeTimer: number | undefined;
let settleTimer: number | undefined;

export function onBottomInset(listener: (state: BottomInsetState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bottomLift(): number {
  return liveLift;
}

/** Элемент, который должен ехать вместе с нижним краем. Движение проигрывает композитор по
 *  длительности и кривой источника — за кадр не выполняется ни строчки скрипта. */
export function registerInsetMover(el: HTMLElement, mode: InsetMoverMode): () => void {
  movers.set(el, mode);
  return () => {
    movers.delete(el);
  };
}

function viewportHeight(): number {
  return Math.max(window.innerHeight, document.documentElement.clientHeight);
}

function probe(existing: HTMLElement | null, height: string): HTMLElement {
  if (existing) return existing;
  const node = document.createElement('div');
  node.style.cssText = `position:fixed;left:-9999px;top:0;width:1px;pointer-events:none;height:${height}`;
  document.body.append(node);
  return node;
}

function measure(node: HTMLElement): number {
  return Math.round(parseFloat(getComputedStyle(node).height)) || 0;
}

function readSafeBottom(): number {
  safeProbe = probe(safeProbe, 'env(safe-area-inset-bottom,0px)');
  return measure(safeProbe);
}

/** Полоска жестов гаснет раньше, чем поедет клавиатура, и возвращается раньше, чем та
 *  опустится. Перечитываем её только когда всё успокоилось: иначе композер шатнётся на
 *  её высоту в начале и в конце движения. */
function scheduleSafeBottomHold(): void {
  window.clearTimeout(safeTimer);
  safeTimer = window.setTimeout(() => {
    if (keyboardHeight > 0 || panelOpen) return;
    const value = readSafeBottom();
    if (value === heldSafeBottom) return;
    heldSafeBottom = value;
    document.documentElement.style.setProperty('--safe-bottom-hold', `${value}px`);
  }, SAFE_SETTLE_MS);
}

function liftOf(height: number): number {
  return Math.max(0, height - Math.max(heldSafeBottom, 0));
}

function targetLift(keyboardAt: number): number {
  return Math.max(liftOf(keyboardAt), panelOpen ? panelLift : 0);
}

function panelStorageKey(): string {
  return `${PANEL_LIFT_KEY}.${window.innerWidth > window.innerHeight ? 'land' : 'port'}`;
}

function storedPanelLift(): number {
  try {
    return Number(window.localStorage.getItem(panelStorageKey())) || 0;
  } catch {
    return 0;
  }
}

function rememberPanelLift(value: number): void {
  if (value <= 0 || value === panelLift) return;
  panelLift = value;
  document.documentElement.style.setProperty('--emoji-panel-h', `${value}px`);
  try {
    window.localStorage.setItem(panelStorageKey(), String(value));
  } catch {
    return;
  }
}

function offsetOf(mode: InsetMoverMode, atLift: number): number {
  return mode === 'chrome' ? -atLift : layoutLift - atLift;
}

function stopMoving(): void {
  for (const animation of running) animation.cancel();
  running.clear();
}

/** Одна анимация на элемент, на всё движение. Значения задаются абсолютные, заливки нет:
 *  по окончании элемент остаётся на том, что уже написано в CSS. */
function startMoving(fromLift: number, toLift: number, duration: number, easing: string): Animation | null {
  stopMoving();
  if (duration <= 0 || fromLift === toLift) return null;

  let first: Animation | null = null;
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
    first = first ?? animation;
  }
  return first;
}

function writeVariables(nextLayoutLift: number, nextLiveLift: number, occupied: boolean): void {
  const root = document.documentElement;
  layoutLift = nextLayoutLift;
  liveLift = nextLiveLift;

  if (occupied) root.dataset.bottomLift = 'on';
  root.style.setProperty('--bottom-lift', `${nextLayoutLift}px`);
  root.style.setProperty('--bottom-lift-live', `${nextLiveLift}px`);
  // Снять признак в этом же кадре нельзя: стиль считается один раз, в конце задачи, и
  // увидит уже снятый признак — а значит вернёт переход на отступ ленты ровно на то
  // изменение, ради которого он и выключался.
  if (!occupied) {
    requestAnimationFrame(() => {
      if (layoutLift === 0 && liveLift === 0) delete root.dataset.bottomLift;
    });
  }
}

function notify(phase: BottomInsetPhase, layoutShift: number): void {
  const state: BottomInsetState = { layoutShift, phase };
  for (const listener of listeners) listener(state);
}

function settle(): void {
  window.clearTimeout(settleTimer);
  stopMoving();
  const lift = targetLift(keyboardHeight);
  const laidOut = layoutLift;
  writeVariables(lift, lift, lift > 0);
  notify('end', layoutLift - laidOut);
}

function move(toLift: number, duration: number, easing: string): void {
  window.clearTimeout(settleTimer);
  if (toLift === liveLift || duration <= 0) {
    settle();
    return;
  }

  const fromLift = liveLift;
  const laidOut = layoutLift;
  writeVariables(RESTING_LIFT, toLift, true);
  notify('start', layoutLift - laidOut);
  const animation = startMoving(fromLift, toLift, duration, easing);
  animation?.finished.then(settle, () => undefined);
  settleTimer = window.setTimeout(settle, duration + (animation ? SETTLE_MARGIN_MS : 0));
}

function cssValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function cssDuration(name: string): number {
  const raw = cssValue(name);
  if (raw.endsWith('ms')) return parseFloat(raw) || 0;
  if (raw.endsWith('s')) return (parseFloat(raw) || 0) * 1000;
  return FALLBACK_DURATION_MS;
}

export function setEmojiPanelLift(open: boolean): void {
  if (open === panelOpen) return;
  panelOpen = open;
  scheduleSafeBottomHold();
  move(
    targetLift(keyboardHeight),
    cssDuration(open ? '--dur-menu' : '--dur-close'),
    cssValue(open ? '--ease-screen' : '--ease-close') || FALLBACK_EASING,
  );
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
    keyboardHeight = height;
    rememberPanelLift(liftOf(height));
    settle();
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
      keyboardHeight = Math.round(event.target ?? 0);
      move(
        targetLift(keyboardHeight),
        event.duration ?? FALLBACK_DURATION_MS,
        event.easing || FALLBACK_EASING,
      );
      return;
    }

    keyboardHeight = Math.round(event.height);
    rememberPanelLift(liftOf(keyboardHeight));
    settle();
    scheduleSafeBottomHold();
    if (keyboardHeight > 0) revealFocused(keyboardHeight);
  });
}

export function initBottomInset(): void {
  const keyboard = virtualKeyboard();
  if (keyboard) keyboard.overlaysContent = true;

  heldSafeBottom = readSafeBottom();
  document.documentElement.style.setProperty('--safe-bottom-hold', `${heldSafeBottom}px`);

  const stored = storedPanelLift();
  panelProbe = probe(panelProbe, 'var(--emoji-panel-h)');
  rememberPanelLift(stored > 0 ? stored : measure(panelProbe));

  watchWebSources();
  void watchNativeInsets();
}
