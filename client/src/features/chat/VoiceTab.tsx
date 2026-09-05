import type { ChatAttachmentDto } from '@messenger/shared';
import { useEffect, useRef, type MouseEvent } from 'react';

import { useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { Skeleton } from '../../ui/Skeleton';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { haptic } from '../../ui/haptic';
import { formatMediaDuration } from '../media/MediaTile';
import { formatAttachmentDateTime } from '../messages/dayLabel';
import { useVoicePlayback } from '../voice/useVoicePlayback';
import type { FastScrollBinding } from './FastScroller';
import type { AttachmentSelectionBinding } from './mediaSelection';
import { useShowInChatMenu } from './showInChat';
import { useChatAttachments } from './useChatAttachments';
import styles from './VoiceTab.module.css';

const SKELETON_ROWS = 6;

function VoiceRow({
  item,
  own,
  chatId,
  senderName,
  selection,
  onMenu,
}: {
  item: ChatAttachmentDto;
  own: boolean;
  chatId: string;
  senderName: string;
  selection?: AttachmentSelectionBinding;
  onMenu: (messageId: number, anchor: DOMRect) => void;
}) {
  const { src, audioRef, playing, togglePlay } = useVoicePlayback(item.attachment, own, chatId);
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
    togglePlay();
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (selection?.active) return;
    onMenu(item.messageId, event.currentTarget.getBoundingClientRect());
  }

  return (
    <div
      className={styles.row}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onContextMenu={handleContextMenu}
    >
      <audio ref={audioRef} src={src} preload="none" />
      {selection?.active ? (
        <button
          type="button"
          className={styles.checkboxButton}
          aria-pressed={selected}
          aria-label={`Выделить голосовое сообщение от ${own ? 'себя' : senderName}`}
          onClick={handleClick}
        >
          <span className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ''}`} aria-hidden="true">
            {selected && <Icon name="check" size={12} />}
          </span>
        </button>
      ) : (
        <button
          type="button"
          className={styles.playButton}
          onClick={handleClick}
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        >
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
      )}
      <span className={styles.info}>
        <span className={styles.date}>{formatAttachmentDateTime(item.createdAt)}</span>
        <span className={styles.meta}>
          {own ? 'Вы' : senderName} · {formatMediaDuration(item.attachment.duration ?? 0)}
        </span>
      </span>
    </div>
  );
}

export function VoiceTab({
  chatId,
  fastScroll,
  selection,
}: {
  chatId: string;
  fastScroll?: FastScrollBinding;
  selection?: AttachmentSelectionBinding;
}) {
  const { items, setItems, status, hasMore, sentinelRef, retry } = useChatAttachments(chatId, 'voice');

  useEffect(() => {
    fastScroll?.setItems(items);
  }, [fastScroll, items]);

  useEffect(() => {
    const removed = selection?.pendingRemoval;
    if (!removed) return;
    setItems((prev) => prev.filter((item) => !removed.has(item.messageId)));
  }, [selection?.pendingRemoval, setItems]);

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
          selection={selection}
          onMenu={menu.open}
        />
      ))}
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
      {menu.node}
    </div>
  );
}
