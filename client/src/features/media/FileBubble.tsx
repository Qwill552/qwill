import type { AttachmentDto } from '@messenger/shared';
import type { ReactNode } from 'react';

import { useFileSrc } from '../../api/useFileSrc';
import { Icon } from '../../ui/Icon';
import { formatBytes } from '../messages/Attachment';
import { downloadHref } from './downloadFile';
import { fileKindFor } from './fileKind';
import styles from './FileBubble.module.css';

export function FileBubble({ attachment, meta }: { attachment: AttachmentDto; meta?: ReactNode }) {
  const href = useFileSrc(attachment.file.id, 'stream');

  return (
    <a
      className={styles.file}
      href={href && downloadHref(href, attachment.originalName)}
      download={attachment.originalName}
      rel="noreferrer"
    >
      <span className={styles.icon}>
        <Icon name={fileKindFor(attachment.file.mimeType).icon} size={22} />
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
