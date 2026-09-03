import type { AttachmentDto } from '@messenger/shared';
import type { ReactNode } from 'react';

import { Icon } from '../../ui/Icon';
import { formatBytes } from '../messages/Attachment';
import { ProgressRing } from '../messages/ProgressRing';
import { fileKindFor } from './fileKind';
import { useFileDownload } from './useFileDownload';
import styles from './FileBubble.module.css';

export function FileBubble({ attachment, meta }: { attachment: AttachmentDto; meta?: ReactNode }) {
  const { state, progress, activate, cancel } = useFileDownload(attachment);
  const busy = state === 'downloading';

  return (
    <button
      type="button"
      className={styles.file}
      onClick={busy ? cancel : activate}
      aria-label={busy ? `Отменить загрузку ${attachment.originalName}` : attachment.originalName}
    >
      <span className={styles.icon}>
        <Icon name={fileKindFor(attachment.file.mimeType).icon} size={22} />
        {busy && (
          <span className={styles.progress}>
            <ProgressRing progress={progress} />
            <Icon name="close" size={14} className={styles.cancelGlyph} />
          </span>
        )}
        {state === 'ready' && (
          <span className={styles.ready} aria-hidden="true">
            <Icon name="check" size={12} />
          </span>
        )}
      </span>
      <span className={styles.info}>
        <span className={styles.name}>{attachment.originalName}</span>
        <span className={styles.footer}>
          <span className={styles.size}>{formatBytes(attachment.file.size)}</span>
          {meta}
        </span>
      </span>
    </button>
  );
}
