import type { ChatAttachmentDto } from '@messenger/shared';
import { useEffect } from 'react';

import { Icon } from '../../ui/Icon';
import { IconTile } from '../../ui/IconTile';
import { Skeleton } from '../../ui/Skeleton';
import { fileKindFor } from '../media/fileKind';
import { useFileDownload } from '../media/useFileDownload';
import { formatBytes } from '../messages/Attachment';
import { formatAttachmentDateTime } from '../messages/dayLabel';
import { ProgressRing } from '../messages/ProgressRing';
import type { FastScrollBinding } from './FastScroller';
import { useChatAttachments } from './useChatAttachments';
import styles from './FilesTab.module.css';

const SKELETON_ROWS = 8;

function FileRow({ item }: { item: ChatAttachmentDto }) {
  const { attachment } = item;
  const kind = fileKindFor(attachment.file.mimeType);
  const { state, progress, activate, cancel } = useFileDownload(attachment);
  const busy = state === 'downloading';

  return (
    <button
      type="button"
      className={styles.row}
      onClick={busy ? cancel : activate}
      aria-label={busy ? `Отменить загрузку ${attachment.originalName}` : attachment.originalName}
    >
      <span className={styles.lead}>
        <IconTile icon={kind.icon} tint={kind.tint} />
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
        <span className={styles.meta}>
          {formatBytes(attachment.file.size)} · {formatAttachmentDateTime(item.createdAt)}
        </span>
      </span>
    </button>
  );
}

export function FilesTab({ chatId, fastScroll }: { chatId: string; fastScroll?: FastScrollBinding }) {
  const { items, status, hasMore, sentinelRef, retry } = useChatAttachments(chatId, 'file');

  useEffect(() => {
    fastScroll?.setItems(items);
  }, [fastScroll, items]);

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
    <div className={styles.list} ref={fastScroll?.listRef}>
      {items.map((item) => (
        <FileRow key={item.attachment.id} item={item} />
      ))}
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
    </div>
  );
}
