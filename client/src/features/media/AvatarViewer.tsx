import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFileSrc } from '../../api/useFileSrc';
import { useEscapeKey } from '../../app/hotkeys';
import { useBackHandler } from '../../app/useBackHandler';
import { GlassButton } from '../../ui/chrome/GlassButton';
import { fileIdFromUrl } from '../../ui/Avatar';
import { useAvatarViewerStore } from './avatarViewerStore';
import styles from './AvatarViewer.module.css';

const TAP_SLOP = 8;
const DISMISS_PX = 110;
const DISMISS_SCALE = 0.45;
const FLING = 0.5;

function durationMs(name: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

export function AvatarViewer() {
  const url = useAvatarViewerStore((s) => s.url);
  if (!url) return null;
  return <AvatarViewerStage url={url} />;
}

function AvatarViewerStage({ url }: { url: string }) {
  const label = useAvatarViewerStore((s) => s.label);
  const close = useAvatarViewerStore((s) => s.close);

  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [dragging, setDragging] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const gesture = useRef({
    active: false,
    startX: 0,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
    moved: false,
    onImage: false,
  });

  const fileId = fileIdFromUrl(url);
  const src = useFileSrc(fileId, 'full');

  const startClose = useCallback(() => setClosing(true), []);
  useBackHandler(!closing, startClose);
  useEscapeKey(!closing, startClose);

  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(close, durationMs('--dur-screen'));
    return () => window.clearTimeout(timer);
  }, [closing, close]);

  function applyDrag(dy: number): void {
    const image = imageRef.current;
    if (image) image.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
    const backdrop = backdropRef.current;
    if (backdrop) {
      const progress = Math.min(1, Math.max(0, dy) / (window.innerHeight * DISMISS_SCALE));
      backdrop.style.opacity = progress > 0 ? String(1 - progress * 0.7) : '';
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (closing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
      onImage: (event.target as HTMLElement).closest('img') != null,
    };
    setDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const g = gesture.current;
    if (!g.active) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;

    const elapsed = event.timeStamp - g.lastTime;
    if (elapsed > 0) g.velocity = (event.clientY - g.lastY) / elapsed;
    g.lastY = event.clientY;
    g.lastTime = event.timeStamp;

    applyDrag(Math.max(0, dy));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const g = gesture.current;
    if (!g.active) return;
    g.active = false;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const dy = Math.max(0, event.clientY - g.startY);

    if (dy > DISMISS_PX || (g.velocity > FLING && dy > 0)) {
      startClose();
      return;
    }

    applyDrag(0);

    if (!g.moved && !g.onImage) startClose();
  }

  function handleSave(): void {
    if (!src) return;
    const link = document.createElement('a');
    link.href = src;
    link.download = 'avatar.jpg';
    link.rel = 'noreferrer';
    document.body.append(link);
    link.click();
    link.remove();
  }

  return createPortal(
    <div
      className={`${styles.viewer} ${entered ? styles.entered : ''} ${closing ? styles.closing : ''}`}
      data-no-back-swipe
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div ref={backdropRef} className={styles.backdrop} aria-hidden="true" />

      <div
        className={styles.stage}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {src && (
          <img
            ref={imageRef}
            className={`${styles.image} ${dragging ? styles.imageDragging : ''}`}
            src={src}
            alt={label}
            draggable={false}
          />
        )}
      </div>

      <div className={styles.controls}>
        <GlassButton icon="close" label="Закрыть" variant="chrome" onClick={startClose} />
        <GlassButton icon="download" label="Скачать фото" variant="chrome" onClick={handleSave} disabled={!src} />
      </div>
    </div>,
    document.body,
  );
}
