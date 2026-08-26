import type { AttachmentDto } from '@messenger/shared';
import type { ReactNode } from 'react';

import type { LocalAttachmentState } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { FileBubble } from '../media/FileBubble';
import { MediaBubble } from '../media/MediaBubble';
import { isViewableMedia } from '../media/mediaKind';
import { ProgressRing } from './ProgressRing';
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

export function AttachmentView({
  attachment,
  chatId,
  meta,
}: {
  attachment: AttachmentDto;
  chatId: string;
  meta?: ReactNode;
}) {
  if (isViewableMedia(attachment)) return <MediaBubble attachment={attachment} chatId={chatId} />;
  return <FileBubble attachment={attachment} meta={meta} />;
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
  meta,
}: {
  local: LocalAttachmentState;
  onCancel: () => void;
  onRetry: () => void;
  meta?: ReactNode;
}) {
  const failed = !!local.error;

  const preview =
    local.previewUrl && local.kind === 'image' ? (
      <img className={styles.image} src={local.previewUrl} alt={local.name} />
    ) : local.previewUrl && local.kind === 'video' ? (
      <video className={styles.video} src={local.previewUrl} muted />
    ) : local.kind === 'image' ? (
      <div className={styles.imagePlaceholder} />
    ) : (
      <div className={styles.file}>
        <span className={styles.fileIcon}>
          <Icon name={localIcon(local.kind)} size={22} />
        </span>
        <span className={styles.fileInfo}>
          <span className={styles.fileName}>{local.name}</span>
          <span className={styles.fileFooter}>
            <span className={styles.fileSize}>{formatBytes(local.size)}</span>
            {meta}
          </span>
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
