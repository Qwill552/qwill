import type { ChatAttachmentDto } from '@messenger/shared';

import { useFileSrc } from '../../api/useFileSrc';
import { IconTile } from '../../ui/IconTile';
import { Skeleton } from '../../ui/Skeleton';
import { downloadFile } from '../media/downloadFile';
import { fileKindFor } from '../media/fileKind';
import { formatBytes } from '../messages/Attachment';
import { formatAttachmentDateTime } from '../messages/dayLabel';
import { useChatAttachments } from './useChatAttachments';
import styles from './FilesTab.module.css';

const SKELETON_ROWS = 8;

function FileRow({ item }: { item: ChatAttachmentDto }) {
  const { attachment } = item;
  const kind = fileKindFor(attachment.file.mimeType);
  const href = useFileSrc(attachment.file.id, 'stream');

  function open(): void {
    if (!href) return;
    downloadFile(href, attachment.originalName);
  }

  return (
    <button type="button" className={styles.row} onClick={open}>
      <IconTile icon={kind.icon} tint={kind.tint} />
      <span className={styles.info}>
        <span className={styles.name}>{attachment.originalName}</span>
        <span className={styles.meta}>
          {formatBytes(attachment.file.size)} · {formatAttachmentDateTime(item.createdAt)}
        </span>
      </span>
    </button>
  );
}

export function FilesTab({ chatId }: { chatId: string }) {
  const { items, status, hasMore, sentinelRef, retry } = useChatAttachments(chatId, 'file');

  if (status === 'loading' && items.length === 0) {
    return (
      <div className={styles.list} aria-busy="true">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton width="30px" height="30px" />
            <span className={styles.skeletonLines}>
              <Skeleton width="65%" height="14px" />
              <Skeleton width="40%" height="12px" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error' && items.length === 0) {
    return (
      <div className={styles.failure}>
        <span>Не удалось загрузить</span>
        <button type="button" className={styles.retry} onClick={retry}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {items.map((item) => (
        <FileRow key={item.attachment.id} item={item} />
      ))}
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
    </div>
  );
}
