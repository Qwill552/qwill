import type { ChatAttachmentDto } from '@messenger/shared';
import { useEffect, useRef } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { Skeleton } from '../../ui/Skeleton';
import { MediaTile } from '../media/MediaTile';
import { openMediaViewerList, useMediaViewerStore, type MediaViewerItem } from '../media/mediaViewerStore';
import { useChatAttachments } from './useChatAttachments';
import styles from './GifTab.module.css';

const SKELETON_TILES = 4;

const TILE_STYLE = { width: '100%', height: 'auto' } as const;

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

  if (status === 'loading' && items.length === 0) {
    return (
      <div className={styles.list} aria-busy="true">
        {Array.from({ length: SKELETON_TILES }, (_, i) => (
          <Skeleton key={i} className={styles.skeletonTile} width="100%" height="160px" />
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
      <div className={styles.list}>
        {items.map((item) => (
          <MediaTile
            key={item.attachment.id}
            attachment={item.attachment}
            chatId={chatId}
            className={styles.tile}
            style={TILE_STYLE}
            fit="natural"
            standalone
            onOpen={() => openMediaViewerList(chatId, viewerItems(), item.attachment.id)}
          />
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
    </>
  );
}
