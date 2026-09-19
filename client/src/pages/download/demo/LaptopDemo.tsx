import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { DEMO_RETURN, LAPTOP_LOGICAL } from '../config';
import { DemoSurface } from './DemoSurface';
import type { DemoStore } from './engine/store';
import { dialogOf } from './replica/phone/demoData';
import { LaptopReplica, type MenuPoint } from './replica/laptop/LaptopReplica';

function pointInScreen(event: MouseEvent, screen: HTMLElement): MenuPoint {
  const box = screen.getBoundingClientRect();
  const scale = box.width > 0 ? LAPTOP_LOGICAL.width / box.width : 1;
  return {
    x: (event.clientX - box.left) * scale,
    y: (event.clientY - box.top) * scale,
  };
}

export function LaptopDemo({ store }: { store: DemoStore }) {
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pointerAway, setPointerAway] = useState(false);
  const [menuPoint, setMenuPoint] = useState<MenuPoint | null>(null);
  const [handOver, setHandOver] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function openMenu(event: MouseEvent): void {
      event.preventDefault();
      const host = rootRef.current;
      if (!host) return;
      const target = event.target;
      const marked = target instanceof Element ? target.closest('[data-demo-message]') : null;
      const messageId = marked instanceof HTMLElement ? marked.dataset.demoMessage : undefined;
      const open = dialogOf(store.snapshot().chatPeer);
      if (!messageId || !open.some((message) => message.id === messageId)) return;
      setMenuPoint(pointInScreen(event, host));
      store.override('menuMessageId', messageId);
      store.override('overlay', 'menu');
    }

    root.addEventListener('contextmenu', openMenu);
    return () => root.removeEventListener('contextmenu', openMenu);
  }, [store]);

  useEffect(() => {
    if (handOver) {
      setPointerAway(true);
      return;
    }
    const timer = window.setTimeout(() => setPointerAway(false), DEMO_RETURN.idleMs);
    return () => window.clearTimeout(timer);
  }, [handOver]);

  useEffect(() => {
    if (!menuPoint) return;
    const timer = window.setTimeout(() => setMenuPoint(null), DEMO_RETURN.discreteIdleMs);
    return () => window.clearTimeout(timer);
  }, [menuPoint]);

  return (
    <DemoSurface store={store} rootRef={rootRef} onPointerActivity={setHandOver}>
      <LaptopReplica
        state={state}
        listSurface={store.surfaceOf('chatsScroll', 'top')}
        feedSurface={store.surfaceOf('feedScroll', 'bottom')}
        typingReadout={store.readoutOf('typing')}
        voiceReadout={store.readoutOf('voice')}
        callSecondsReadout={store.readoutOf('callSeconds')}
        queryReadout={store.readoutOf('searchTyping')}
        pointer={store.pointerOf()}
        pointerAway={pointerAway}
        menuPoint={menuPoint}
      />
    </DemoSurface>
  );
}
