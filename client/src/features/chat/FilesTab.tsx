import type { ChatAttachmentDto } from '@messenger/shared';
import { useEffect, useRef, type MouseEvent } from 'react';

import { Icon } from '../../ui/Icon';
import { IconTile } from '../../ui/IconTile';
import { Skeleton } from '../../ui/Skeleton';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { haptic } from '../../ui/haptic';
import { fileKindFor } from '../media/fileKind';
import { useFileDownload } from '../media/useFileDownload';
import { formatBytes } from '../messages/Attachment';
import { formatAttachmentDateTime } from '../messages/dayLabel';
import { ProgressRing } from '../messages/ProgressRing';
import type { FastScrollBinding } from './FastScroller';
import type { AttachmentSelectionBinding } from './mediaSelection';
import { useShowInChatMenu } from './showInChat';
import { useChatAttachments } from './useChatAttachments';
import styles from './FilesTab.module.css';

const SKELETON_ROWS = 8;

function FileRow({
  item,
  selection,
  onMenu,
}: {
  item: ChatAttachmentDto;
  selection?: AttachmentSelectionBinding;
  onMenu: (messageId: number, anchor: DOMRect) => void;
}) {
  const { attachment } = item;
  const kind = fileKindFor(attachment.file.mimeType);
  const { state, progress, activate, cancel } = useFileDownload(attachment);
  const busy = state === 'downloading';
  const selected = (selection?.active && selection.selectedIds.has(item.messageId)) ?? false;
  const longPressFiredRef = useRef(false);

  const longPress = useLongPress({
    onLongPress: () => {
      longPressFiredRef.current = true;
      haptic();
      selection?.onLongPress({ messageId: item.messageId, senderId: item.senderId });
    },
    disabled: () => selection?.active ?? false,
  });

  function handleClick(): void {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (selection?.active) {
      selection.onTap({ messageId: item.messageId, senderId: item.senderId });
      return;
    }
    if (busy) cancel();
    else activate();
  }

  function handleContextMenu(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    if (selection?.active) return;
    onMenu(item.messageId, event.currentTarget.getBoundingClientRect());
  }

  return (
    <button
      type="button"
      className={styles.row}
      onClick={handleClick}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onContextMenu={handleContextMenu}
      aria-pressed={selection?.active ? selected : undefined}
      aria-label={busy ? `Отменить загрузку ${attachment.originalName}` : attachment.originalName}
    >
      <span className={styles.lead}>
        {selection?.active ? (
          <span className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ''}`} aria-hidden="true">
            {selected && <Icon name="check" size={12} />}
          </span>
        ) : (
          <>
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
          </>
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

export function FilesTab({
  chatId,
  fastScroll,
  selection,
}: {
  chatId: string;
  fastScroll?: FastScrollBinding;
  selection?: AttachmentSelectionBinding;
}) {
  const { items, setItems, status, hasMore, sentinelRef, retry } = useChatAttachments(chatId, 'file');
  const menu = useShowInChatMenu(chatId);

  useEffect(() => {
    fastScroll?.setItems(items);
  }, [fastScroll, items]);

  useEffect(() => {
    const removed = selection?.pendingRemoval;
    if (!removed) return;
    setItems((prev) => prev.filter((item) => !removed.has(item.messageId)));
  }, [selection?.pendingRemoval, setItems]);

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
        <FileRow key={item.attachment.id} item={item} selection={selection} onMenu={menu.open} />
      ))}
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
      {menu.node}
    </div>
  );
}
