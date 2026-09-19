import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';

import { DEMO_GLOW_SIZE, DEMO_HINT_VISIBLE_MS } from '../config';
import { CONTENT } from '../content';
import type { DemoStore } from './engine/store';
import styles from './PhoneDemo.module.css';
import { ALBUM_PHOTOS, EMOJI_STRIP_URL } from './replica/phone/demoData';
import { PhoneReplica } from './replica/phone/PhoneReplica';

let hintSpent = false;

interface PhoneDemoProps {
  store: DemoStore;
  scenarioScrimLit: boolean;
  onScenarioScrimTransitionEnd: () => void;
}

export function PhoneDemo({ store, scenarioScrimLit, onScenarioScrimTransitionEnd }: PhoneDemoProps) {
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  const rootRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);
  const [hinting, setHinting] = useState(false);
  const [glowing, setGlowing] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return store.mount(root);
  }, []);

  useEffect(() => {
    for (const photo of ALBUM_PHOTOS) {
      const image = new Image();
      image.src = photo.src;
      void image.decode().catch(() => undefined);
    }
    new Image().src = EMOJI_STRIP_URL;
  }, []);

  useEffect(() => {
    if (!hinting) return;
    const timer = window.setTimeout(() => setHinting(false), DEMO_HINT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [hinting]);

  function follow(event: PointerEvent<HTMLDivElement>): void {
    const root = rootRef.current;
    const glow = glowRef.current;
    if (!root || !glow) return;
    const box = root.getBoundingClientRect();
    const scale = root.offsetWidth > 0 ? box.width / root.offsetWidth : 1;
    const x = (event.clientX - box.left) / scale - DEMO_GLOW_SIZE / 2;
    const y = (event.clientY - box.top) / scale - DEMO_GLOW_SIZE / 2;
    glow.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function enter(event: PointerEvent<HTMLDivElement>): void {
    if (event.pointerType !== 'mouse') return;
    setGlowing(true);
    follow(event);
    if (hintSpent) return;
    hintSpent = true;
    setHinting(true);
  }

  return (
    <div
      ref={rootRef}
      className={styles.demo}
      style={{ ['--demo-glow-size' as string]: `${DEMO_GLOW_SIZE}px` }}
      onPointerEnter={enter}
      onPointerMove={follow}
      onPointerLeave={() => setGlowing(false)}
    >
      <PhoneReplica
        state={state}
        chatsSurface={store.surfaceOf('chatsScroll', 'top')}
        feedSurface={store.surfaceOf('feedScroll', 'bottom')}
        profileSurface={store.surfaceOf('profileScroll', 'top')}
        settingsSurface={store.surfaceOf('settingsScroll', 'top')}
        typingReadout={store.readoutOf('typing')}
        voiceReadout={store.readoutOf('voice')}
        callSecondsReadout={store.readoutOf('callSeconds')}
        scenarioScrimLit={scenarioScrimLit}
        onScenarioScrimTransitionEnd={onScenarioScrimTransitionEnd}
      />

      <span ref={glowRef} className={glowing ? `${styles.glow} ${styles.glowLit}` : styles.glow} />

      <span className={hinting ? `${styles.hint} ${styles.hintShown}` : styles.hint}>
        {CONTENT.demoHint}
      </span>
    </div>
  );
}
