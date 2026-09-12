import type { ChatLinkDto } from '@messenger/shared';
import { useCallback, useEffect } from 'react';

import { getChatLinksRequest } from '../../api/chats';
import { useFileSrc } from '../../api/useFileSrc';
import { useLinkPreviewStore } from '../../stores/linkPreviewStore';
import { fileIdFromUrl } from '../../ui/Avatar';
import { Skeleton } from '../../ui/Skeleton';
import { avatarGradientFor } from '../../ui/tint';
import type { FastScrollBinding } from './FastScroller';
import { useShowInChatMenu, useShowInChatTrigger } from './showInChat';
import { usePagedByMessage, type PagedCursor } from './useChatAttachments';
import styles from './LinksTab.module.css';

const SKELETON_ROWS = 8;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, '');
  } catch {
    return url;
  }
}

function LinkRow({ item, onMenu }: { item: ChatLinkDto; onMenu: (messageId: number, anchor: DOMRect) => void }) {
  const cached = useLinkPreviewStore((state) => state.previews[item.url]);
  const request = useLinkPreviewStore((state) => state.request);
  const prime = useLinkPreviewStore((state) => state.prime);

  const preview = cached ?? item.preview;
  const ready = preview?.status === 'ready' ? preview : null;
  const imageSrc = useFileSrc(ready?.imageUrl ? fileIdFromUrl(ready.imageUrl) : null, { tier: 'full' });

  const settled = item.preview !== null && item.preview.status !== 'pending';

  useEffect(() => {
    if (settled && item.preview) prime(item.preview);
    else request(item.url);
  }, [settled, item.preview, item.url, prime, request]);

  const host = hostOf(item.url);
  const trigger = useShowInChatTrigger(item.messageId, onMenu);

  return (
    <a className={styles.row} href={item.url} target="_blank" rel="noopener noreferrer nofollow" {...trigger}>
      <span className={styles.thumb} style={imageSrc ? undefined : { backgroundImage: avatarGradientFor(host) }}>
        {imageSrc ? <img className={styles.image} src={imageSrc} alt="" loading="lazy" /> : host.charAt(0).toUpperCase()}
      </span>
      <span className={styles.info}>
        {ready?.title && <span className={styles.title}>{ready.title}</span>}
        {ready?.description && <span className={styles.description}>{ready.description}</span>}
        {!ready?.title && !ready?.description && <span className={styles.title}>{host}</span>}
        <span className={styles.url}>{item.url}</span>
      </span>
    </a>
  );
}

export function LinksTab({ chatId, fastScroll }: { chatId: string; fastScroll?: FastScrollBinding }) {
  const loadPage = useCallback(
    (cursor?: PagedCursor) =>
      getChatLinksRequest(chatId, cursor?.before).then((page) => ({
        items: page.items,
        hasMoreBefore: page.hasMore,
        hasMoreAfter: false,
      })),
    [chatId],
  );
  const { items, status, hasMoreBefore, sentinelRef, retry } = usePagedByMessage(loadPage);
  const menu = useShowInChatMenu(chatId);

  useEffect(() => {
    fastScroll?.setItems(items);
  }, [fastScroll, items]);

  if (status === 'loading' && items.length === 0) {
    return (
      <div className={styles.list} aria-busy="true">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton width="54px" height="54px" />
            <span className={styles.skeletonLines}>
              <Skeleton width="60%" height="14px" />
              <Skeleton width="85%" height="12px" />
              <Skeleton width="45%" height="12px" />
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
      {items.map((item, index) => (
        <LinkRow key={`${item.messageId}:${index}`} item={item} onMenu={menu.open} />
      ))}
      {hasMoreBefore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
      {menu.node}
    </div>
  );
}
