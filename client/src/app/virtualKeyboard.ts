import { Capacitor, registerPlugin } from '@capacitor/core';

interface VirtualKeyboard extends EventTarget {
  overlaysContent: boolean;
  boundingRect: DOMRectReadOnly;
}

type NavigatorWithVirtualKeyboard = Navigator & {
  virtualKeyboard?: VirtualKeyboard;
};

function virtualKeyboard(): VirtualKeyboard | undefined {
  return (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;
}

interface KeyboardInsetsPlugin {
  addListener(
    eventName: 'keyboardInset',
    listener: (event: { height: number; settled: boolean }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

let published = -1;
let nativeDriven = false;

function focusedEditable(): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  const editable =
    active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  return editable ? active : null;
}

type HeightListener = (height: number, previous: number) => void;

const listeners = new Set<HeightListener>();

/** Подписка на высоту клавиатуры. Вызывается **синхронно**, в том же кадре, где меняется
 *  `--keyboard-h`: тому, кто подстраивает прокрутку под новый отступ, нельзя узнать об
 *  этом кадром позже — иначе содержимое сначала стоит, а потом догоняет рывком. */
export function onKeyboardHeight(listener: HeightListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function apply(height: number): void {
  if (height === published) return;
  const previous = published;
  published = height;

  const root = document.documentElement;
  if (height > 0) root.dataset.keyboard = 'up';
  root.style.setProperty('--keyboard-h', `${height}px`);
  if (height === 0) delete root.dataset.keyboard;

  for (const listener of listeners) listener(height, Math.max(previous, 0));
}

function layoutHeight(): number {
  return Math.max(window.innerHeight, document.documentElement.clientHeight);
}

function settle(height: number): void {
  apply(height);
  if (height === 0) return;

  const field = focusedEditable();
  if (field && field.getBoundingClientRect().bottom > layoutHeight() - height) {
    field.scrollIntoView({ block: 'center' });
    return;
  }
  window.scrollTo(0, 0);
}

/** Оболочка и браузер сообщают о клавиатуре по-разному, и ровно одним способом каждый.
 *  В WebView сжимается визуальный вьюпорт, а `boundingRect` пуст; в Chrome вьюпорт не
 *  шевелится вовсе, зато честен `boundingRect`. Берём наибольшее из двух. */
function keyboardHeight(): number {
  const viewport = window.visualViewport;
  const fromViewport = viewport ? layoutHeight() - viewport.height * viewport.scale : 0;
  const fromApi = virtualKeyboard()?.boundingRect.height ?? 0;
  return Math.max(0, fromViewport, fromApi);
}

function watchWebSources(): void {
  const onChange = (): void => {
    if (nativeDriven) return;
    settle(Math.round(keyboardHeight()));
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
    const height = Math.round(event.height);
    if (event.settled) settle(height);
    else apply(height);
  });
}

export function initVirtualKeyboard(): void {
  const keyboard = virtualKeyboard();
  if (keyboard) keyboard.overlaysContent = true;

  watchWebSources();
  void watchNativeInsets();
}
