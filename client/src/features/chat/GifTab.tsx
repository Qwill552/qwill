import type { ChatAttachmentDto } from '@messenger/shared';
import { useEffect, useMemo, useRef } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { Skeleton } from '../../ui/Skeleton';
import { MediaTile } from '../media/MediaTile';
import { mosaicLayout, normalizeRatio } from '../media/mosaicLayout';
import { openMediaViewerList, useMediaViewerStore, type MediaViewerItem } from '../media/mediaViewerStore';
import { mediaRatio } from '../media/useMediaSrc';
import { useChatAttachments } from './useChatAttachments';
import styles from './GifTab.module.css';

const SKELETON_ROWS = [3, 2, 3];

export function GifTab({ chatId }: { chatId: string }) {
  const { items, setItems, status, hasMore, sentinelRef, retry } = useChatAttachments(chatId, 'gif');

  const myUserId = useChatStore((s) => s.myUserId);
  const myName = useAuthStore((s) => s.user?.displayName ?? '');
  const otherName = useChatStore((s) => s.chats.find((c) => c.id === chatId)?.otherMember?.displayName ?? '');

  const itemsRef = useRef<ChatAttachmentDto[]>(items);
  itemsRef.current = items;

  useEffect(
    () =>
      useMediaViewerStore.subscribe((state, previous) => {
        if (!previous.detached || state.chatId === null) return;
        const gone = previous.items
          .filter((was) => !state.items.some((item) => item.messageId === was.messageId))
          .map((was) => was.messageId);
        if (gone.length === 0) return;
        setItems((prev) => prev.filter((item) => !gone.includes(item.messageId)));
      }),
    [setItems],
  );

  function viewerItems(): MediaViewerItem[] {
    return itemsRef.current.map((item) => ({
      messageId: item.messageId,
      attachment: item.attachment,
      senderName: item.senderId === myUserId ? myName : otherName,
      createdAt: item.createdAt,
      own: item.senderId === myUserId,
    }));
  }

  const layout = useMemo(() => mosaicLayout(items.map((item) => mediaRatio(item.attachment))), [items]);

  if (status === 'loading' && items.length === 0) {
    return (
      <div className={styles.mosaic} aria-busy="true">
        {SKELETON_ROWS.map((count, row) => (
          <div key={row} className={styles.skeletonRow}>
            {Array.from({ length: count }, (_, cell) => (
              <Skeleton key={cell} className={styles.skeletonCell} width="100%" height="100%" />
            ))}
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
    <>
      <div className={styles.mosaic}>
        {layout.rows.map((row) => {
          const rowRatio = row.indexes.reduce(
            (sum, index) => sum + normalizeRatio(mediaRatio(items[index]!.attachment)),
            0,
          );
          return (
            <div key={row.indexes.join('-')} className={styles.row} style={{ aspectRatio: rowRatio }}>
              {row.indexes.map((index) => {
                const item = items[index];
                if (!item) return null;
                const ratio = normalizeRatio(mediaRatio(item.attachment));
                return (
                  <div key={item.attachment.id} className={styles.cell} style={{ flexGrow: ratio }}>
                    <MediaTile
                      attachment={item.attachment}
                      chatId={chatId}
                      fit="natural"
                      standalone
                      onOpen={() => openMediaViewerList(chatId, viewerItems(), item.attachment.id)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
    </>
  );
}
