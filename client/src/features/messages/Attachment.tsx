import type { AttachmentDto } from '@messenger/shared';

import type { LocalAttachmentState } from '../../stores/chatStore';
import { useFileSrc } from '../../api/useFileSrc';
import { Icon } from '../../ui/Icon';
import styles from './Attachment.module.css';

export function isVoiceAttachment(attachment: AttachmentDto): boolean {
  return attachment.peaks !== null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function AttachmentView({ attachment }: { attachment: AttachmentDto }) {
  const isImage = attachment.file.mimeType.startsWith('image/');
  const isVideo = attachment.file.mimeType.startsWith('video/');

  const thumbFileId = attachment.thumbnail?.id ?? (isImage ? attachment.file.id : null);
  const thumbSrc = useFileSrc(thumbFileId, 'thumb');
  const fileSrc = useFileSrc(isImage ? null : attachment.file.id, 'stream');

  const aspectRatio = attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : undefined;

  if (isImage) {
    return (
      <img
        className={styles.image}
        src={thumbSrc}
        alt={attachment.originalName}
        style={aspectRatio ? { aspectRatio } : undefined}
      />
    );
  }

  if (isVideo) {
    return (
      <video
        className={styles.video}
        controls
        poster={thumbSrc}
        src={fileSrc}
        style={aspectRatio ? { aspectRatio } : undefined}
      />
    );
  }

  return (
    <a className={styles.file} href={fileSrc} download={attachment.originalName} target="_blank" rel="noreferrer">
      <Icon name="file" size={22} className={styles.fileIcon} />
      <span className={styles.fileInfo}>
        <span className={styles.fileName}>{attachment.originalName}</span>
        <span className={styles.fileSize}>{formatBytes(attachment.file.size)}</span>
      </span>
    </a>
  );
}

const RING_RADIUS = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ progress }: { progress: number }) {
  return (
    <svg className={styles.ring} viewBox="0 0 36 36" aria-hidden="true">
      <circle className={styles.ringTrack} cx="18" cy="18" r={RING_RADIUS} />
      <circle
        className={styles.ringFill}
        cx="18"
        cy="18"
        r={RING_RADIUS}
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
      />
    </svg>
  );
}

function localIcon(kind: LocalAttachmentState['kind']): 'image' | 'file' | 'mic' {
  if (kind === 'image' || kind === 'video') return 'image';
  if (kind === 'voice') return 'mic';
  return 'file';
}

export function LocalAttachmentPreview({
  local,
  onCancel,
  onRetry,
}: {
  local: LocalAttachmentState;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const failed = !!local.error;

  const preview =
    local.previewUrl && local.kind === 'image' ? (
      <img className={styles.image} src={local.previewUrl} alt={local.name} />
    ) : local.previewUrl && local.kind === 'video' ? (
      <video className={styles.video} src={local.previewUrl} muted />
    ) : (
      <div className={styles.file}>
        <Icon name={localIcon(local.kind)} size={22} className={styles.fileIcon} />
        <span className={styles.fileInfo}>
          <span className={styles.fileName}>{local.name}</span>
          <span className={styles.fileSize}>{formatBytes(local.size)}</span>
        </span>
      </div>
    );

  return (
    <div className={styles.localWrap}>
      <div className={styles.localPreview}>
        {preview}
        <div className={styles.overlay}>
          {failed ? (
            <button type="button" className={styles.retryButton} onClick={onRetry} aria-label="Повторить отправку">
              <Icon name="retry" size={20} />
            </button>
          ) : (
            <>
              <ProgressRing progress={local.progress} />
              <button type="button" className={styles.cancelButton} onClick={onCancel} aria-label="Отменить отправку">
                <Icon name="close" size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      {failed && <span className={styles.errorLabel}>{local.error}</span>}
    </div>
  );
}
