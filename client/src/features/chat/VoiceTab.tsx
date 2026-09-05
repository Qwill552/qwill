import type { ChatAttachmentDto } from '@messenger/shared';
import { useEffect } from 'react';

import { useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { Skeleton } from '../../ui/Skeleton';
import { formatMediaDuration } from '../media/MediaTile';
import { formatAttachmentDateTime } from '../messages/dayLabel';
import { useVoicePlayback } from '../voice/useVoicePlayback';
import type { FastScrollBinding } from './FastScroller';
import { useShowInChatMenu, useShowInChatTrigger } from './showInChat';
import { useChatAttachments } from './useChatAttachments';
import styles from './VoiceTab.module.css';

const SKELETON_ROWS = 6;

function VoiceRow({
  item,
  own,
  chatId,
  senderName,
  onMenu,
}: {
  item: ChatAttachmentDto;
  own: boolean;
  chatId: string;
  senderName: string;
  onMenu: (messageId: number, anchor: DOMRect) => void;
}) {
  const { src, audioRef, playing, togglePlay } = useVoicePlayback(item.attachment, own, chatId);
  const trigger = useShowInChatTrigger(item.messageId, onMenu);

  return (
    <div className={styles.row} {...trigger}>
      <audio ref={audioRef} src={src} preload="none" />
      <button
        type="button"
        className={styles.playButton}
        onClick={togglePlay}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      <span className={styles.info}>
        <span className={styles.date}>{formatAttachmentDateTime(item.createdAt)}</span>
        <span className={styles.meta}>
          {own ? 'Вы' : senderName} · {formatMediaDuration(item.attachment.duration ?? 0)}
        </span>
      </span>
    </div>
  );
}

export function VoiceTab({ chatId, fastScroll }: { chatId: string; fastScroll?: FastScrollBinding }) {
  const { items, status, hasMore, sentinelRef, retry } = useChatAttachments(chatId, 'voice');

  useEffect(() => {
    fastScroll?.setItems(items);
  }, [fastScroll, items]);
  const myUserId = useChatStore((s) => s.myUserId);
  const otherName = useChatStore((s) => s.chats.find((c) => c.id === chatId)?.otherMember?.displayName ?? '');
  const menu = useShowInChatMenu(chatId);

  if (status === 'loading' && items.length === 0) {
    return (
      <div className={styles.list} aria-busy="true">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton circle width="44px" height="44px" />
            <span className={styles.skeletonLines}>
              <Skeleton width="35%" height="14px" />
              <Skeleton width="55%" height="12px" />
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
        <VoiceRow
          key={item.attachment.id}
          item={item}
          own={item.senderId === myUserId}
          chatId={chatId}
          senderName={otherName}
          onMenu={menu.open}
        />
      ))}
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
      {menu.node}
    </div>
  );
}
