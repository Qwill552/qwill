import { Capacitor, registerPlugin } from '@capacitor/core';

interface VirtualKeyboard extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRectReadOnly;
}

type NavigatorWithVirtualKeyboard = Navigator & {
  virtualKeyboard?: VirtualKeyboard;
};

export type KeyboardPhase = 'start' | 'move' | 'end';

export interface KeyboardState {
  /** Подъём, на который уже пересчитана раскладка: отступ ленты, высота фейда, кнопка «вниз». */
  liftLayout: number;
  /** Подъём, на котором клавиатура находится прямо сейчас. По нему едет картинка. */
  liftLive: number;
  phase: KeyboardPhase;
}

interface KeyboardInsetsPlugin {
  addListener(
    eventName: 'keyboardInset',
    listener: (event: { height: number; target: number; phase: KeyboardPhase }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

function virtualKeyboard(): VirtualKeyboard | undefined {
  return (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;
}

const SAFE_SETTLE_MS = 600;

const listeners = new Set<(state: KeyboardState) => void>();

let nativeDriven = false;
let layoutHeight_ = 0;
let liveHeight = 0;
let heldSafeBottom = -1;
let safeProbe: HTMLElement | null = null;
let safeTimer: number | undefined;

/** Подписка на клавиатуру. Вызывается **синхронно**: тому, кто подстраивает прокрутку,
 *  нельзя узнать о новой высоте кадром позже — иначе содержимое сначала стоит, а потом
 *  догоняет рывком. */
export function onKeyboardState(listener: (state: KeyboardState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
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
    if (liveHeight > 0) return;
    const value = readSafeBottom();
    if (value === heldSafeBottom) return;
    heldSafeBottom = value;
    document.documentElement.style.setProperty('--safe-bottom-hold', `${value}px`);
  }, SAFE_SETTLE_MS);
}

function lift(height: number): number {
  return Math.max(0, height - Math.max(heldSafeBottom, 0));
}

/** Раскладка пересчитывается дважды за движение, картинка едет каждый кадр. Менять отступ
 *  ленты покадрово нельзя: чтение её высоты после этого стоит целый кадр на длинной
 *  переписке, и клавиатура уезжает вперёд, пока мы считаем. */
function publish(nextLayout: number, nextLive: number, phase: KeyboardPhase): void {
  const root = document.documentElement;
  const layoutChanged = nextLayout !== layoutHeight_;
  const liveChanged = nextLive !== liveHeight;
  if (!layoutChanged && !liveChanged && phase === 'move') return;

  layoutHeight_ = nextLayout;
  liveHeight = nextLive;

  if (nextLive > 0 || nextLayout > 0) root.dataset.keyboard = 'up';
  if (layoutChanged) root.style.setProperty('--keyboard-h', `${nextLayout}px`);
  root.style.setProperty('--keyboard-live', `${nextLive}px`);
  if (nextLive === 0 && nextLayout === 0) delete root.dataset.keyboard;

  const state: KeyboardState = { liftLayout: lift(nextLayout), liftLive: lift(nextLive), phase };
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
    if (nativeDriven) return;
    const height = Math.round(webKeyboardHeight());
    publish(height, height, 'end');
    if (height > 0) revealFocused(height);
  };

  window.visualViewport?.addEventListener('resize', onChange);
  window.visualViewport?.addEventListener('scroll', onChange);
  virtualKeyboard()?.addEventListener('geometrychange', onChange);
  onChange();
}

async function watchNativeInsets(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('QwillKeyboard')) return;

  const plugin = registerPlugin<KeyboardInsetsPlugin>('QwillKeyboard');
  await plugin.addListener('keyboardInset', (event) => {
    nativeDriven = true;
    const target = Math.round(event.target);
    const height = Math.round(event.height);

    if (event.phase === 'start') {
      // Пока клавиатура едет, раскладка стоит на большем из двух концов: на убирании
      // отнятый отступ было бы нечем компенсировать — прокрутка упёрлась бы в конец.
      publish(Math.max(layoutHeight_, target), liveHeight, 'start');
      return;
    }
    if (event.phase === 'end') {
      publish(height, height, 'end');
      scheduleSafeBottomHold();
      if (height > 0) revealFocused(height);
      return;
    }
    publish(layoutHeight_, height, 'move');
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
