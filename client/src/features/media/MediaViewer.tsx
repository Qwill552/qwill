import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useFileSrc } from '../../api/useFileSrc';
import { downloadFile } from './downloadFile';
import { useEscapeKey } from '../../app/hotkeys';
import { useBackHandler } from '../../app/useBackHandler';
import { useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { DeleteMessageModal } from '../messages/DeleteMessageModal';
import { ForwardSheet } from '../messages/ForwardSheet';
import { fitRect, findMediaRect, flipTransform, type MediaRect } from './mediaAnchor';
import { isVideoAttachment } from './mediaKind';
import { useShowInChat } from '../chat/showInChat';
import { useMediaViewerStore, type MediaViewerItem } from './mediaViewerStore';
import { mediaRatio, usePreviewSrc, useViewerSrc } from './useMediaSrc';
import styles from './MediaViewer.module.css';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const TAP_SLOP = 8;
const TAP_MS = 320;
const FLING = 0.5;
const PAGE_RATIO = 0.28;
const DISMISS_PX = 110;
const DISMISS_SCALE = 0.45;
const SETTLE_MS = 260;
const STRIP_WINDOW = 12;

interface Vector {
  x: number;
  y: number;
}

interface Zoom extends Vector {
  scale: number;
}

const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 };

interface LiveGesture {
  pageX: number;
  dismissX: number;
  dismissY: number;
  zoom: Zoom;
}

function idleGesture(): LiveGesture {
  return { pageX: 0, dismissX: 0, dismissY: 0, zoom: NO_ZOOM };
}

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
  const showInChat = useShowInChat();
  const readOnly = useMediaViewerStore((s) => s.readOnly);
  const detached = useMediaViewerStore((s) => s.detached);
  const deleteMessage = useChatStore((s) => s.deleteMessage);

  const viewport = useViewport();
  const stripRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pointers = useRef(new Map<number, Vector>());
  const live = useRef<LiveGesture>(idleGesture());
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
  const [gesturing, setGesturing] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [settled, setSettled] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  const current = items[index];
  const ratio = current ? (mediaRatio(current.attachment) ?? naturalRatio ?? 1) : 1;
  const target = fitRect(ratio, viewport.width, viewport.height);

  const indexRef = useRef(index);
  indexRef.current = index;
  const targetRef = useRef<MediaRect>(target);
  targetRef.current = target;
  const closingRef = useRef(closing);
  closingRef.current = closing;
  const enteredRef = useRef(entered);
  enteredRef.current = entered;

  const [openFrom] = useState<MediaRect | null>(() => (current ? findMediaRect(current.attachment.id) : null));

  const streamSrc = useFileSrc(current ? current.attachment.file.id : null, 'stream');

  const startClose = useCallback(() => setClosing(true), []);
  useBackHandler(!closing, startClose);
  useEscapeKey(!closing, startClose);

  const registerMedia = useCallback((node: HTMLElement | null) => {
    mediaRef.current = node;
  }, []);

  const dismissProgress = useCallback(
    (dy: number) => Math.min(1, Math.max(0, dy) / (viewport.height * DISMISS_SCALE)),
    [viewport.height],
  );

  const applyLive = useCallback(() => {
    const { pageX, dismissX, dismissY, zoom: liveZoom } = live.current;

    const track = trackRef.current;
    if (track) track.style.transform = `translate3d(calc(${-indexRef.current * 100}% + ${pageX}px), 0, 0)`;

    const progress = dismissProgress(dismissY);

    const media = mediaRef.current;
    if (media) {
      const item = items[indexRef.current];
      media.style.transform = closingRef.current
        ? item
          ? closeTransform(item, targetRef.current, openFrom)
          : 'scale(0.9)'
        : enteredRef.current
          ? `translate(${liveZoom.x + dismissX}px, ${liveZoom.y + dismissY}px) scale(${liveZoom.scale * (1 - progress * 0.35)})`
          : openFrom
            ? flipTransform(openFrom, targetRef.current)
            : 'scale(0.9)';
    }

    const backdrop = backdropRef.current;
    if (backdrop) backdrop.style.opacity = String(enteredRef.current && !closingRef.current ? 1 - progress * 0.7 : 0);
  }, [dismissProgress, items, openFrom]);

  const scheduleFrame = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      applyLive();
    });
  }, [applyLive]);

  useLayoutEffect(() => {
    applyLive();
  }, [applyLive, index, entered, closing, gesturing, viewport.width, viewport.height, zoom]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

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
      if (event.key === 'ArrowRight') setIndex(index + 1);
      if (event.key === 'ArrowLeft') setIndex(index - 1);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [startClose, setIndex, index]);

  useEffect(() => {
    live.current = idleGesture();
    setZoom(NO_ZOOM);
    setNaturalRatio(null);
  }, [index]);

  useEffect(() => {
    setSettled(false);
    if (gesturing || closing || !entered) return;
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [index, gesturing, closing, entered]);

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
      live.current.pageX = 0;
      live.current.dismissX = 0;
      live.current.dismissY = 0;
      setDismissing(false);
      scheduleFrame();
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
      const currentZoom = live.current.zoom;
      const spreadRatio = before.spread > 0 && after.spread > 0 ? after.spread / before.spread : 1;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentZoom.scale * spreadRatio));
      const applied = scale / currentZoom.scale;
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      live.current.zoom = clampZoom({
        scale,
        x: after.x - centerX - (before.x - centerX - currentZoom.x) * applied,
        y: after.y - centerY - (before.y - centerY - currentZoom.y) * applied,
      });
      scheduleFrame();
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

    if (live.current.zoom.scale > MIN_SCALE) {
      const panned = live.current.zoom;
      live.current.zoom = clampZoom({
        ...panned,
        x: panned.x + (after.x - before.x),
        y: panned.y + (after.y - before.y),
      });
      scheduleFrame();
      return;
    }

    if (g.axis === null && g.moved) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';

    if (g.axis === 'x') {
      live.current.pageX = dx;
    } else if (g.axis === 'y') {
      live.current.dismissX = dx * 0.3;
      live.current.dismissY = dy;
      if ((dy > 0) !== dismissing) setDismissing(dy > 0);
    }
    scheduleFrame();
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const active = pointers.current;
    if (!active.delete(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (active.size > 0) return;

    const g = gesture.current;
    g.axis = null;

    const { pageX, dismissY } = live.current;
    const settledZoom = live.current.zoom;
    live.current.pageX = 0;
    live.current.dismissX = 0;
    live.current.dismissY = 0;

    setGesturing(false);
    setDismissing(false);
    setZoom(settledZoom);

    if (dismissY > DISMISS_PX || (g.velocityY > FLING && dismissY > 0)) {
      startClose();
      return;
    }

    if (pageX !== 0) {
      const threshold = viewport.width * PAGE_RATIO;
      if (pageX < -threshold || g.velocityX < -FLING) setIndex(index + 1);
      else if (pageX > threshold || g.velocityX > FLING) setIndex(index - 1);
      return;
    }

    if (!g.moved && event.timeStamp - g.startTime < TAP_MS && settledZoom.scale === MIN_SCALE) {
      setChrome((visible) => !visible);
    }
  }

  function handleSave(): void {
    if (!streamSrc || !current) return;
    downloadFile(streamSrc, current.attachment.originalName);
  }

  function handleDelete(): void {
    if (!current) return;
    setDeleteConfirm(true);
  }

  function handleShowInChat(): void {
    if (!current || !chatId) return;
    const { messageId } = current;
    closeViewer();
    void showInChat(chatId, messageId);
  }

  function handleConfirmDelete(): void {
    setDeleteConfirm(false);
    if (!current) return;
    const { messageId } = current;
    dropMessage(messageId);
    deleteMessage(chatId, messageId).catch(() => undefined);
  }

  if (!current) return null;

  const menuItems: MenuItem[] = [{ id: 'save', label: 'Сохранить', icon: 'download', onSelect: handleSave }];
  if (detached && chatId) {
    menuItems.push({ id: 'show-in-chat', label: 'Показать в чате', icon: 'chats', onSelect: handleShowInChat });
  }
  if (!readOnly) {
    menuItems.push({ id: 'forward', label: 'Переслать', icon: 'forward', onSelect: () => setForwarding(true) });
  }
  if (current.own && !readOnly) {
    menuItems.push({ id: 'delete', label: 'Удалить', icon: 'trash', danger: true, onSelect: handleDelete });
  }

  const chromeHidden = !chrome || !entered || closing || dismissing;
  const wantOriginal = settled || zoom.scale > MIN_SCALE;

  return createPortal(
    <div
      className={styles.viewer}
      data-no-back-swipe
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр медиа"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div ref={backdropRef} className={styles.backdrop} style={{ opacity: 0 }} aria-hidden="true" />

      <div
        className={styles.stage}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div ref={trackRef} className={`${styles.track} ${gesturing ? styles.trackLive : ''}`}>
          {items.map((item, position) => {
            if (Math.abs(position - index) > 1) return null;
            const active = position === index;
            return (
              <ViewerPage
                key={item.attachment.id}
                item={item}
                offset={position * 100}
                box={active ? target : fitRect(mediaRatio(item.attachment) ?? 1, viewport.width, viewport.height)}
                animated={active && !gesturing}
                active={active}
                wantOriginal={active && wantOriginal}
                registerMedia={registerMedia}
                onNaturalRatio={active ? setNaturalRatio : undefined}
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
              position={position}
              active={position === index}
              load={Math.abs(position - index) <= STRIP_WINDOW}
              onSelect={setIndex}
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

      {deleteConfirm && (
        <DeleteMessageModal count={1} onCancel={() => setDeleteConfirm(false)} onConfirm={handleConfirmDelete} />
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
  animated,
  active,
  wantOriginal,
  registerMedia,
  onNaturalRatio,
}: {
  item: MediaViewerItem;
  offset: number;
  box: MediaRect;
  animated: boolean;
  active: boolean;
  wantOriginal: boolean;
  registerMedia: (node: HTMLElement | null) => void;
  onNaturalRatio?: (ratio: number) => void;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const video = isVideoAttachment(item.attachment);
  const poster = usePreviewSrc(item.attachment);
  const imageSrc = useViewerSrc(item.attachment, wantOriginal);
  const videoSrc = useFileSrc(video && active ? item.attachment.file.id : null, 'stream');

  useLayoutEffect(() => {
    if (active) registerMedia(nodeRef.current);
    else if (nodeRef.current) nodeRef.current.style.transform = '';
  }, [active, registerMedia]);

  return (
    <div className={styles.page} style={{ left: `${offset}%` }}>
      <div
        ref={nodeRef}
        className={`${styles.media} ${animated ? styles.mediaAnimated : ''} ${active ? styles.mediaActive : ''}`}
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
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

const StripThumb = memo(function StripThumb({
  item,
  position,
  active,
  load,
  onSelect,
}: {
  item: MediaViewerItem;
  position: number;
  active: boolean;
  load: boolean;
  onSelect: (position: number) => void;
}) {
  return (
    <button
      type="button"
      data-active={active}
      className={`${styles.thumb} ${active ? styles.thumbActive : ''}`}
      onClick={() => onSelect(position)}
      aria-label={item.attachment.originalName}
    >
      {load && <StripThumbImage item={item} />}
    </button>
  );
});

function StripThumbImage({ item }: { item: MediaViewerItem }) {
  const src = usePreviewSrc(item.attachment);
  return src ? <img className={styles.thumbImage} src={src} alt="" draggable={false} /> : null;
}
