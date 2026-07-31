import type { AttachmentDto } from '@messenger/shared';

import { useFileSrc } from '../../api/useFileSrc';
import styles from './Attachment.module.css';

function formatBytes(bytes: number): string {
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

/** Картинка/видео инлайн с превью, остальное — карточка со скачиванием (секция 7). */
export function AttachmentView({ attachment }: { attachment: AttachmentDto }) {
  const isImage = attachment.file.mimeType.startsWith('image/');
  const isVideo = attachment.file.mimeType.startsWith('video/');

  const thumbFileId = attachment.thumbnail?.id ?? (isImage ? attachment.file.id : null);
  const thumbSrc = useFileSrc(thumbFileId);
  const fileSrc = useFileSrc(isImage ? null : attachment.file.id);

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
      <span className={styles.fileIcon}>📎</span>
      <span className={styles.fileInfo}>
        <span className={styles.fileName}>{attachment.originalName}</span>
        <span className={styles.fileSize}>{formatBytes(attachment.file.size)}</span>
      </span>
    </a>
  );
}
