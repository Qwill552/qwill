import { Capacitor, registerPlugin } from '@capacitor/core';

type NavigatorWithVirtualKeyboard = Navigator & {
  virtualKeyboard?: { overlaysContent: boolean };
};

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

function apply(height: number): void {
  if (height === published) return;
  published = height;
  document.documentElement.style.setProperty('--keyboard-h', `${height}px`);
}

function settle(height: number): void {
  apply(height);
  if (height === 0) return;

  const field = focusedEditable();
  if (field && field.getBoundingClientRect().bottom > window.innerHeight - height) {
    field.scrollIntoView({ block: 'center' });
    return;
  }
  window.scrollTo(0, 0);
}

function keyboardHeight(viewport: VisualViewport): number {
  return Math.max(0, window.innerHeight - viewport.height * viewport.scale);
}

function watchViewport(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;

  const onChange = (): void => {
    if (nativeDriven) return;
    settle(Math.round(keyboardHeight(viewport)));
  };

  viewport.addEventListener('resize', onChange);
  viewport.addEventListener('scroll', onChange);
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
  const keyboard = (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;
  if (keyboard) keyboard.overlaysContent = true;

  watchViewport();
  void watchNativeInsets();
}
