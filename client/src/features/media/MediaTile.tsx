import type { AttachmentDto } from '@messenger/shared';
import { useRef, type CSSProperties } from 'react';

import { Icon } from '../../ui/Icon';
import { isVideoAttachment } from './mediaKind';
import { openMediaViewer } from './mediaViewerStore';
import { useProgressiveSrc } from './useMediaSrc';
import styles from './MediaTile.module.css';

interface MediaTileProps {
  attachment: AttachmentDto;
  chatId: string;
  wantOriginal?: boolean;
  className?: string;
  style?: CSSProperties;
  fit?: 'cover' | 'natural';
  overlay?: string;
  standalone?: boolean;
}

export function formatMediaDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

export function MediaTile({
  attachment,
  chatId,
  wantOriginal = false,
  className,
  style,
  fit = 'cover',
  overlay,
  standalone = false,
}: MediaTileProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const src = useProgressiveSrc(attachment, ref, wantOriginal);
  const video = isVideoAttachment(attachment);
  const natural = fit === 'natural';

  return (
    <button
      ref={ref}
      type="button"
      data-media-tile="true"
      data-media-id={attachment.id}
      className={`${styles.tile} ${natural ? styles.tileNatural : ''} ${className ?? ''}`}
      style={style}
      aria-label={video ? `Видео ${attachment.originalName}` : `Фото ${attachment.originalName}`}
      onClick={(event) => {
        if (standalone || event.detail === 0) openMediaViewer(chatId, attachment.id);
      }}
    >
      {src && (
        <img
          className={natural ? styles.natural : styles.cover}
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
    </button>
  );
}
