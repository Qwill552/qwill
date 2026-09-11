import { Capacitor, registerPlugin } from '@capacitor/core';

export type BackGesturePhase = 'start' | 'progress' | 'cancel' | 'invoke';

export interface BackGestureEvent {
  phase: BackGesturePhase;
  progress: number;
  edge: 'left' | 'right';
  touchY: number;
}

interface BackGesturePlugin {
  addListener(
    eventName: 'backGesture',
    listener: (event: BackGestureEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  takeBackGesture(): Promise<void>;
}

const listeners = new Set<(event: BackGestureEvent) => void>();

const hasNativeBackGesture =
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('QwillBackGesture');

let plugin: BackGesturePlugin | null = null;

export function onBackGesture(listener: (event: BackGestureEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function takeBackGesture(): void {
  void plugin?.takeBackGesture();
}

export function initBackGesture(): void {
  if (!hasNativeBackGesture) return;

  plugin = registerPlugin<BackGesturePlugin>('QwillBackGesture');
  void plugin.addListener('backGesture', (event) => {
    for (const listener of listeners) listener(event);
  });
}
