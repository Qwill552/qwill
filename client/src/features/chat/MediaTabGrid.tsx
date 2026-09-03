import type { ChatAttachmentDto } from '@messenger/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getChatAttachmentsRequest } from '../../api/chats';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { Skeleton } from '../../ui/Skeleton';
import { MediaTile } from '../media/MediaTile';
import { openMediaViewerList, useMediaViewerStore, type MediaViewerItem } from '../media/mediaViewerStore';
import styles from './MediaTabGrid.module.css';

const SKELETON_TILES = 12;
const LOAD_AHEAD_PX = 600;

interface MediaTabGridProps {
  chatId: string;
}

export function MediaTabGrid({ chatId }: MediaTabGridProps) {
  const [items, setItems] = useState<ChatAttachmentDto[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const itemsRef = useRef<ChatAttachmentDto[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const myUserId = useChatStore((s) => s.myUserId);
  const myName = useAuthStore((s) => s.user?.displayName ?? '');
  const otherName = useChatStore((s) => s.chats.find((c) => c.id === chatId)?.otherMember?.displayName ?? '');

  itemsRef.current = items;

  const load = useCallback(
    async (before?: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (before === undefined) setStatus('loading');
      try {
        const page = await getChatAttachmentsRequest(chatId, 'media', before);
        setItems((prev) => (before === undefined ? page.items : [...prev, ...page.items]));
        setHasMore(page.hasMore);
        setStatus('ready');
      } catch {
        setStatus('error');
      } finally {
        loadingRef.current = false;
      }
    },
    [chatId],
  );

  useEffect(() => {
    setItems([]);
    setHasMore(true);
    void load();
  }, [load]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || status !== 'ready' || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const last = itemsRef.current.at(-1);
        if (last) void load(last.messageId);
      },
      { rootMargin: `0px 0px ${LOAD_AHEAD_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [status, hasMore, items.length, load]);

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
    [],
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
      <div className={styles.grid} aria-busy="true">
        {Array.from({ length: SKELETON_TILES }, (_, i) => (
          <span key={i} className={styles.skeletonCell}>
            <Skeleton className={styles.skeletonFill} width="100%" height="100%" />
          </span>
        ))}
      </div>
    );
  }

  if (status === 'error' && items.length === 0) {
    return (
      <div className={styles.failure}>
        <span>Не удалось загрузить</span>
        <button type="button" className={styles.retry} onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {items.map((item) => (
          <MediaTile
            key={item.attachment.id}
            attachment={item.attachment}
            chatId={chatId}
            className={styles.tile}
            standalone
            onOpen={() => openMediaViewerList(chatId, viewerItems(), item.attachment.id)}
          />
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
    </>
  );
}
