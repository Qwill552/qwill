import type { AttachmentDto } from '@messenger/shared';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import { currentScrollEpoch, exceedsMoveThreshold } from '../../ui/gestures/gestureReducer';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { haptic } from '../../ui/haptic';
import { Icon } from '../../ui/Icon';
import { isVideoAttachment } from './mediaKind';
import { openMediaViewer } from './mediaViewerStore';
import { BLURHASH_CANVAS_SIDE, useBlurhashCanvas, useDecodedSrc, useProgressiveSrc } from './useMediaSrc';
import styles from './MediaTile.module.css';

interface MediaTileProps {
  attachment: AttachmentDto;
  chatId: string;
  className?: string;
  style?: CSSProperties;
  fit?: 'cover' | 'contain';
  overlay?: string;
  standalone?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  onLongPressTile?: () => void;
  onTapSelect?: () => void;
  checkboxSlot?: ReactNode;
  onOpen?: () => void;
}

export function formatMediaDuration(milliseconds: number): string {
  const whole = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

export function MediaTile({
  attachment,
  chatId,
  className,
  style,
  fit = 'cover',
  overlay,
  standalone = false,
  selected = false,
  selectionMode = false,
  onLongPressTile,
  onTapSelect,
  checkboxSlot,
  onOpen,
}: MediaTileProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const src = useDecodedSrc(useProgressiveSrc(attachment, ref, chatId));
  const blurRef = useBlurhashCanvas(attachment.blurhash);
  const video = isVideoAttachment(attachment);
  const albumSelectable = onLongPressTile !== undefined;
  const open = onOpen ?? (() => openMediaViewer(chatId, attachment.id));
  const pointerStartRef = useRef<{ x: number; y: number; epoch: number } | null>(null);
  const longPressFiredRef = useRef(false);

  const longPress = useLongPress({
    onLongPress: () => {
      longPressFiredRef.current = true;
      haptic();
      onLongPressTile?.();
    },
    disabled: () => selectionMode,
  });

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!albumSelectable || (event.pointerType === 'mouse' && event.button !== 0)) return;
    longPressFiredRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY, epoch: currentScrollEpoch() };
    longPress.onPointerDown(event);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!albumSelectable) return;
    longPress.onPointerMove(event);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!albumSelectable) return;
    longPress.onPointerUp();
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (!start) return;
    const strayed = exceedsMoveThreshold(event.clientX - start.x, event.clientY - start.y);
    if (strayed || start.epoch !== currentScrollEpoch()) return;
    if (selectionMode) {
      onTapSelect?.();
      return;
    }
    open();
  }

  function handlePointerCancel(): void {
    if (!albumSelectable) return;
    pointerStartRef.current = null;
    longPress.onPointerCancel();
  }

  return (
    <button
      ref={ref}
      type="button"
      data-media-tile="true"
      data-media-id={attachment.id}
      className={`${styles.tile} ${selected ? styles.tileSelected : ''} ${className ?? ''}`}
      style={style}
      aria-label={video ? `Видео ${attachment.originalName}` : `Фото ${attachment.originalName}`}
      aria-pressed={albumSelectable && selectionMode ? selected : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={(event) => {
        if (albumSelectable) {
          if (event.detail !== 0) return;
          if (selectionMode) onTapSelect?.();
          else open();
          return;
        }
        if (standalone || event.detail === 0) open();
      }}
    >
      {attachment.blurhash && (
        <canvas
          ref={blurRef}
          className={`${styles.blur} ${src ? styles.blurGone : ''}`}
          width={BLURHASH_CANVAS_SIDE}
          height={BLURHASH_CANVAS_SIDE}
          aria-hidden="true"
        />
      )}

      {src && (
        <img
          className={`${fit === 'contain' ? styles.contain : styles.cover} ${styles.shown}`}
          src={src}
          alt=""
          decoding="async"
          draggable={false}
        />
      )}

      {video && (
        <span className={styles.play} aria-hidden="true">
          <Icon name="play" size={20} />
        </span>
      )}

      {video && attachment.duration !== null && (
        <span className={styles.duration}>{formatMediaDuration(attachment.duration)}</span>
      )}

      {overlay && <span className={styles.overlay}>{overlay}</span>}

      {checkboxSlot}
    </button>
  );
}
