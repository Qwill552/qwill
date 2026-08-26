import type { AttachmentDto } from '@messenger/shared';
import type { ReactNode } from 'react';

import { useFileSrc } from '../../api/useFileSrc';
import { Icon, type IconName } from '../../ui/Icon';
import { formatBytes } from '../messages/Attachment';
import styles from './FileBubble.module.css';

function iconFor(mimeType: string): IconName {
  if (mimeType.startsWith('audio/')) return 'mic';
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return 'image';
  return 'file';
}

export function FileBubble({ attachment, meta }: { attachment: AttachmentDto; meta?: ReactNode }) {
  const href = useFileSrc(attachment.file.id, 'stream');

  return (
    <a className={styles.file} href={href} download={attachment.originalName} target="_blank" rel="noreferrer">
      <span className={styles.icon}>
        <Icon name={iconFor(attachment.file.mimeType)} size={22} />
      </span>
      <span className={styles.info}>
        <span className={styles.name}>{attachment.originalName}</span>
        <span className={styles.footer}>
          <span className={styles.size}>{formatBytes(attachment.file.size)}</span>
          {meta}
        </span>
      </span>
    </a>
  );
}
