import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { DEMO_GLOW_SIZE, DEMO_HINT_VISIBLE_MS } from '../config';
import { CONTENT } from '../content';
import styles from './DemoSurface.module.css';
import { whileRunning } from './engine/clock';
import type { DemoStore } from './engine/store';
import { ALBUM_PHOTOS, EMOJI_STRIP_URL } from './replica/phone/demoData';

let hintSpent = false;

interface DemoSurfaceProps {
  store: DemoStore;
  children: ReactNode;
  onPointerActivity?: (inside: boolean) => void;
  rootRef?: RefObject<HTMLDivElement | null>;
}

export function DemoSurface({ store, children, onPointerActivity, rootRef }: DemoSurfaceProps) {
  const ownRef = useRef<HTMLDivElement>(null);
  const hostRef = rootRef ?? ownRef;
  const glowRef = useRef<HTMLSpanElement>(null);
  const [hinting, setHinting] = useState(false);
  const [glowing, setGlowing] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    return store.mount(root);
  }, [store]);

  useEffect(() => whileRunning(setMoving), []);

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
    const root = hostRef.current;
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
    onPointerActivity?.(true);
    if (hintSpent) return;
    hintSpent = true;
    setHinting(true);
  }

  function leave(): void {
    setGlowing(false);
    onPointerActivity?.(false);
  }

  return (
    <div
      ref={hostRef}
      className={moving ? `${styles.demo} ${styles.demoMoving}` : styles.demo}
      style={{ ['--demo-glow-size' as string]: `${DEMO_GLOW_SIZE}px` }}
      onPointerEnter={enter}
      onPointerMove={follow}
      onPointerDown={() => onPointerActivity?.(true)}
      onPointerLeave={leave}
    >
      {children}

      <span ref={glowRef} className={glowing ? `${styles.glow} ${styles.glowLit}` : styles.glow} />

      <span className={hinting ? `${styles.hint} ${styles.hintShown}` : styles.hint}>
        {CONTENT.demoHint}
      </span>
    </div>
  );
}
