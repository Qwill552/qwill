import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFileSrc } from '../../api/useFileSrc';
import { useBackHandler } from '../../app/useBackHandler';
import { useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { ForwardSheet } from '../messages/ForwardSheet';
import { fitRect, findMediaRect, flipTransform, type MediaRect } from './mediaAnchor';
import { isVideoAttachment } from './mediaKind';
import { useMediaViewerStore, type MediaViewerItem } from './mediaViewerStore';
import { mediaRatio, usePreviewSrc, useOriginalSrc } from './useMediaSrc';
import styles from './MediaViewer.module.css';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_SLOP = 8;
const TAP_MS = 320;
const FLING = 0.5;
const PAGE_RATIO = 0.28;
const DISMISS_PX = 110;
const DISMISS_SCALE = 0.45;

interface Vector {
  x: number;
  y: number;
}

interface Zoom extends Vector {
  scale: number;
}

const NO_DRAG: Vector = { x: 0, y: 0 };
const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };

function summarize(pointers: Map<number, Vector>): { x: number; y: number; spread: number } {
  const points = [...pointers.values()];
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const [first, second] = points;
  const spread = first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
  return { x, y, spread };
}

function durationMs(name: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    function onResize(): void {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return size;
}

export function MediaViewer() {
  const chatId = useMediaViewerStore((s) => s.chatId);
  const empty = useMediaViewerStore((s) => s.items.length === 0);
  if (!chatId || empty) return null;
  return <ViewerStage chatId={chatId} />;
}

function ViewerStage({ chatId }: { chatId: string }) {
  const items = useMediaViewerStore((s) => s.items);
  const index = useMediaViewerStore((s) => s.index);
  const setIndex = useMediaViewerStore((s) => s.setIndex);
  const dropMessage = useMediaViewerStore((s) => s.dropMessage);
  const closeViewer = useMediaViewerStore((s) => s.close);
  const deleteMessage = useChatStore((s) => s.deleteMessage);

  const viewport = useViewport();
  const stripRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Vector>());
  const gesture = useRef({
    axis: null as 'x' | 'y' | 'pinch' | null,
    startX: 0,
    startY: 0,
    startTime: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    velocityX: 0,
    velocityY: 0,
    moved: false,
  });

  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const [pageX, setPageX] = useState(0);
  const [dismiss, setDismiss] = useState<Vector>(NO_DRAG);
  const [gesturing, setGesturing] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  const current = items[index];
  const ratio = current ? (mediaRatio(current.attachment) ?? naturalRatio ?? 1) : 1;
  const target = fitRect(ratio, viewport.width, viewport.height);
  const targetRef = useRef<MediaRect>(target);
  targetRef.current = target;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const [openFrom] = useState<MediaRect | null>(() => (current ? findMediaRect(current.attachment.id) : null));

  const streamSrc = useFileSrc(current ? current.attachment.file.id : null, 'stream');

  const startClose = useCallback(() => setClosing(true), []);
  useBackHandler(!closing, startClose);

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
    const timer = window.setTimeout(closeViewer, durationMs('--dur-screen'));
    return () => window.clearTimeout(timer);
  }, [closing, closeViewer]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') startClose();
      if (event.key === 'ArrowRight') setIndex(index + 1);
      if (event.key === 'ArrowLeft') setIndex(index - 1);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [startClose, setIndex, index]);

  useEffect(() => {
    setZoom(NO_ZOOM);
    setPageX(0);
    setDismiss(NO_DRAG);
    setNaturalRatio(null);
  }, [index]);

  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[data-active="true"]');
    if (!strip || !active) return;
    strip.scrollTo({
      left: active.offsetLeft - (strip.clientWidth - active.clientWidth) / 2,
      behavior: 'smooth',
    });
  }, [index]);

  function clampZoom(next: Zoom): Zoom {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    if (scale === MIN_SCALE) return NO_ZOOM;
    const box = targetRef.current;
    const limitX = Math.max(0, (box.width * scale - viewport.width) / 2);
    const limitY = Math.max(0, (box.height * scale - viewport.height) / 2);
    return {
      scale,
      x: Math.min(limitX, Math.max(-limitX, next.x)),
      y: Math.min(limitY, Math.max(-limitY, next.y)),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).closest('video')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setGesturing(true);

    if (pointers.current.size > 1) {
      gesture.current.axis = 'pinch';
      setPageX(0);
      setDismiss(NO_DRAG);
      return;
    }

    gesture.current = {
      axis: null,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
      moved: false,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const active = pointers.current;
    if (!active.has(event.pointerId)) return;

    const before = summarize(active);
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = summarize(active);

    if (active.size > 1) {
      setZoom((currentZoom) => {
        const spreadRatio = before.spread > 0 && after.spread > 0 ? after.spread / before.spread : 1;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentZoom.scale * spreadRatio));
        const applied = scale / currentZoom.scale;
        const centerX = viewport.width / 2;
        const centerY = viewport.height / 2;
        return clampZoom({
          scale,
          x: after.x - centerX - (before.x - centerX - currentZoom.x) * applied,
          y: after.y - centerY - (before.y - centerY - currentZoom.y) * applied,
        });
      });
      return;
    }

    const g = gesture.current;
    const elapsed = event.timeStamp - g.lastTime;
    if (elapsed > 0) {
      g.velocityX = (event.clientX - g.lastX) / elapsed;
      g.velocityY = (event.clientY - g.lastY) / elapsed;
    }
    g.lastX = event.clientX;
    g.lastY = event.clientY;
    g.lastTime = event.timeStamp;

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;

    if (zoomRef.current.scale > MIN_SCALE) {
      setZoom((currentZoom) =>
        clampZoom({ ...currentZoom, x: currentZoom.x + (after.x - before.x), y: currentZoom.y + (after.y - before.y) }),
      );
      return;
    }

    if (g.axis === null && g.moved) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (g.axis === 'x') setPageX(dx);
    else if (g.axis === 'y') setDismiss({ x: dx * 0.3, y: dy });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const active = pointers.current;
    if (!active.delete(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (active.size > 0) return;

    setGesturing(false);
    const g = gesture.current;
    g.axis = null;

    if (dismiss.y > DISMISS_PX || (g.velocityY > FLING && dismiss.y > 0)) {
      startClose();
      return;
    }

    if (pageX !== 0) {
      const threshold = viewport.width * PAGE_RATIO;
      const forward = pageX < -threshold || g.velocityX < -FLING;
      const back = pageX > threshold || g.velocityX > FLING;
      if (forward) setIndex(index + 1);
      else if (back) setIndex(index - 1);
      setPageX(0);
      return;
    }

    setDismiss(NO_DRAG);

    if (!g.moved && event.timeStamp - g.startTime < TAP_MS && zoomRef.current.scale === MIN_SCALE) {
      setChrome((visible) => !visible);
    }
  }

  function handleSave(): void {
    if (!streamSrc || !current) return;
    const link = document.createElement('a');
    link.href = streamSrc;
    link.download = current.attachment.originalName;
    link.rel = 'noreferrer';
    document.body.append(link);
    link.click();
    link.remove();
  }

  function handleDelete(): void {
    if (!current) return;
    const { messageId } = current;
    dropMessage(messageId);
    deleteMessage(chatId, messageId).catch(() => undefined);
  }

  if (!current) return null;

  const dismissProgress = Math.min(1, Math.max(0, dismiss.y) / (viewport.height * DISMISS_SCALE));
  const mediaTransform = closing
    ? closeTransform(current, target, openFrom)
    : entered
      ? `translate(${zoom.x + dismiss.x}px, ${zoom.y + dismiss.y}px) scale(${zoom.scale * (1 - dismissProgress * 0.35)})`
      : openFrom
        ? flipTransform(openFrom, target)
        : 'scale(0.9)';

  const menuItems: MenuItem[] = [
    { id: 'save', label: 'Сохранить', icon: 'download', onSelect: handleSave },
    { id: 'forward', label: 'Переслать', icon: 'forward', onSelect: () => setForwarding(true) },
  ];
  if (current.own) {
    menuItems.push({ id: 'delete', label: 'Удалить', icon: 'trash', danger: true, onSelect: handleDelete });
  }

  const chromeHidden = !chrome || !entered || closing || dismiss.y > 0;

  return createPortal(
    <div className={styles.viewer} data-no-back-swipe role="dialog" aria-modal="true" aria-label="Просмотр медиа">
      <div
        className={styles.backdrop}
        style={{ opacity: entered && !closing ? 1 - dismissProgress * 0.7 : 0 }}
        aria-hidden="true"
      />

      <div
        className={styles.stage}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className={`${styles.track} ${gesturing ? styles.trackLive : ''}`}
          style={{ transform: `translate3d(calc(${-index * 100}% + ${pageX}px), 0, 0)` }}
        >
          {items.map((item, position) => {
            if (Math.abs(position - index) > 1) return null;
            return (
              <ViewerPage
                key={item.attachment.id}
                item={item}
                offset={position * 100}
                box={position === index ? target : fitRect(mediaRatio(item.attachment) ?? 1, viewport.width, viewport.height)}
                transform={position === index ? mediaTransform : 'none'}
                animated={position === index && !gesturing}
                active={position === index}
                onNaturalRatio={position === index ? setNaturalRatio : undefined}
              />
            );
          })}
        </div>
      </div>

      <header className={`${styles.header} ${chromeHidden ? styles.chromeHidden : ''}`}>
        <button type="button" className={styles.iconButton} onClick={startClose} aria-label="Закрыть">
          <Icon name="close" size={22} />
        </button>
        <span className={styles.caption}>
          <span className={styles.author}>{current.senderName}</span>
          <span className={styles.stamp}>{formatStamp(current.createdAt)}</span>
        </span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Действия"
          onClick={(event) => setMenuAnchor(event.currentTarget.getBoundingClientRect())}
        >
          <Icon name="more" size={22} />
        </button>
      </header>

      {items.length > 1 && (
        <div
          ref={stripRef}
          className={`${styles.strip} ${chromeHidden ? styles.chromeHidden : ''} hide-native-scrollbar`}
        >
          {items.map((item, position) => (
            <StripThumb
              key={item.attachment.id}
              item={item}
              active={position === index}
              onSelect={() => setIndex(position)}
            />
          ))}
        </div>
      )}

      {menuAnchor && <Menu anchor={menuAnchor} items={menuItems} onClose={() => setMenuAnchor(null)} />}

      {forwarding && (
        <ForwardSheet
          fromChatId={chatId}
          messageIds={[current.messageId]}
          onClose={() => setForwarding(false)}
          onForwarded={() => setForwarding(false)}
        />
      )}
    </div>,
    document.body,
  );
}

function closeTransform(item: MediaViewerItem, box: MediaRect, openFrom: MediaRect | null): string {
  const back = findMediaRect(item.attachment.id) ?? openFrom;
  return back ? flipTransform(back, box) : 'scale(0.9)';
}

function ViewerPage({
  item,
  offset,
  box,
  transform,
  animated,
  active,
  onNaturalRatio,
}: {
  item: MediaViewerItem;
  offset: number;
  box: MediaRect;
  transform: string;
  animated: boolean;
  active: boolean;
  onNaturalRatio?: (ratio: number) => void;
}) {
  const video = isVideoAttachment(item.attachment);
  const poster = usePreviewSrc(item.attachment);
  const imageSrc = useOriginalSrc(item.attachment);
  const videoSrc = useFileSrc(video && active ? item.attachment.file.id : null, 'stream');

  return (
    <div className={styles.page} style={{ left: `${offset}%` }}>
      <div
        className={`${styles.media} ${animated ? styles.mediaAnimated : ''}`}
        style={{ left: box.left, top: box.top, width: box.width, height: box.height, transform }}
      >
        {video ? (
          <video className={styles.video} src={videoSrc} poster={poster} controls playsInline preload="metadata" />
        ) : (
          <img
            className={styles.image}
            src={imageSrc}
            alt={item.attachment.originalName}
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (onNaturalRatio && image.naturalHeight > 0) onNaturalRatio(image.naturalWidth / image.naturalHeight);
            }}
          />
        )}
      </div>
    </div>
  );
}

function StripThumb({
  item,
  active,
  onSelect,
}: {
  item: MediaViewerItem;
  active: boolean;
  onSelect: () => void;
}) {
  const src = usePreviewSrc(item.attachment);

  return (
    <button
      type="button"
      data-active={active}
      className={`${styles.thumb} ${active ? styles.thumbActive : ''}`}
      onClick={onSelect}
      aria-label={item.attachment.originalName}
    >
      {src && <img className={styles.thumbImage} src={src} alt="" draggable={false} />}
    </button>
  );
}
