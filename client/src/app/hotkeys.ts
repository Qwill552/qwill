import { useEffect, useRef } from 'react';

import { hasOpenOverlay } from './useBackHandler';

export interface Hotkey {
  key?: string;
  code?: string;
  mod?: boolean;
  allowInInput?: boolean;
}

interface EscapeEntry {
  active: boolean;
  onEscape: () => void;
}

const escapeStack: EscapeEntry[] = [];

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  for (let index = escapeStack.length - 1; index >= 0; index -= 1) {
    const entry = escapeStack[index]!;
    if (!entry.active) continue;
    event.preventDefault();
    entry.onEscape();
    return;
  }
}

export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const entryRef = useRef<EscapeEntry>({ active, onEscape });
  entryRef.current.active = active;
  entryRef.current.onEscape = onEscape;

  useEffect(() => {
    const entry = entryRef.current;
    escapeStack.push(entry);
    if (escapeStack.length === 1) window.addEventListener('keydown', handleEscape);
    return () => {
      const index = escapeStack.indexOf(entry);
      if (index >= 0) escapeStack.splice(index, 1);
      if (escapeStack.length === 0) window.removeEventListener('keydown', handleEscape);
    };
  }, []);
}

function matches(event: KeyboardEvent, key: string | undefined, code: string | undefined, mod: boolean): boolean {
  if (event.altKey) return false;
  if (code ? event.code !== code : event.key !== key) return false;
  const modPressed = event.ctrlKey || event.metaKey;
  if (modPressed !== mod) return false;
  return !(mod && event.shiftKey);
}

export function useHotkey(active: boolean, hotkey: Hotkey, onFire: () => void): void {
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;
  const { key, code, mod = false, allowInInput = false } = hotkey;

  useEffect(() => {
    if (!active) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || !matches(event, key, code, mod)) return;
      if (!allowInInput && isTypingTarget(event.target)) return;
      if (hasOpenOverlay()) return;
      event.preventDefault();
      onFireRef.current();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, key, code, mod, allowInInput]);
}
