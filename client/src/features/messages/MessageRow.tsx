import type { ChatMemberSummary, MessageReactionDto } from '@messenger/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { type LocalMessage, useChatStore } from '../../stores/chatStore';
import { useReactionPrefsStore } from '../../stores/reactionPrefsStore';
import { Avatar } from '../../ui/Avatar';
import { currentScrollEpoch, exceedsMoveThreshold } from '../../ui/gestures/gestureReducer';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { useSwipeAction } from '../../ui/gestures/useSwipeAction';
import { useTapGesture } from '../../ui/gestures/useTapGesture';
import { haptic } from '../../ui/haptic';
import { Icon } from '../../ui/Icon';
import { Emoji } from '../emoji/Emoji';
import { EmojiPanel } from '../emoji/EmojiPanel';
import { openMediaViewer } from '../media/mediaViewerStore';
import { DeleteMessageModal } from './DeleteMessageModal';
import { MessageContextMenu, type MenuOrigin, type MessageMenuItem } from './MessageContextMenu';
import styles from './MessageRow.module.css';

interface MessageRowProps {
  own: boolean;
  /** Автор — рисуется только у последнего сообщения серии, но место держится всегда.
   *  Своей вёрстки в референсе нет (там только приватный чат) — минимальное расширение
   *  под группы, см. CLAUDE.md, этап 6. */
  sender: ChatMemberSummary | null;
  /** Колонка аватаров нужна только в группе; в личном чате пузырь стоит у самого края. */
  withAvatarColumn: boolean;
  showAvatar: boolean;
  message: LocalMessage;
  groupIds: number[];
  reactions: MessageReactionDto[];
  chatId: string;
  myId: string | null;
  /** Прочитано всеми, кроме автора — тот же расчёт, что уходит в MessageBubble. */
  read: boolean;
  /** «Изменить» — своё, реальное, неудалённое. */
  canEdit: boolean;
  /** «Удалить» — своё либо права админа группы (ux-ui/06, секция 2). */
  canDelete: boolean;
  /** «Закрепить» — в приватном чате любой участник, в группе — OWNER/ADMIN. */
  canPin: boolean;
  /** В чате с объявлениями отвечать некому: композера нет, свайп-ответ и пункт «Ответить»
   *  вели бы в невидимый контекст (updates/03-announcements-chat.md). */
  canReply: boolean;
  /** Там же незачем реакции: панель в контекстном меню и двойной тап выключаются вместе. */
  canReact: boolean;
  isPinned: boolean;
  onReply: (message: LocalMessage) => void;
  onEdit: (message: LocalMessage) => void;
  onForwardRequest: (messageIds: number[]) => void;
  children: ReactNode;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Заголовок контекстного меню — статус прочтения (ux-ui/06, секция 2: «✓✓ прочитано в 20:10»). */
function statusLabelFor(message: LocalMessage, own: boolean, read: boolean): string | null {
  const time = formatTime(message.createdAt);
  if (!own) return `Отправлено в ${time}`;
  if (message.status === 'sending') return 'Отправка…';
  if (message.status === 'failed') return 'Не отправлено';
  return read ? `✓✓ прочитано в ${time}` : `✓ отправлено в ${time}`;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Буфер обмена недоступен (нет разрешения/незащищённый контекст) — молча не ломаем интерфейс.
  }
}

function selectedTextIn(bubble: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;

  let touchesBubble = false;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    if (selection.getRangeAt(index).intersectsNode(bubble)) {
      touchesBubble = true;
      break;
    }
  }
  if (!touchesBubble) return null;

  const text = selection.toString();
  return text.trim() ? text : null;
}

/** Реакция «вылетает» из точки касания и гаснет — 320 мс, пружина (ux-ui/design-system.md,
 *  «Движение»). Эфемерная, поэтому портал и собственный таймер, а не часть разметки строки. */
function ReactionFly({ x, y, emoji, onDone }: { x: number; y: number; emoji: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 320);
    return () => clearTimeout(timer);
  }, [onDone]);

  return createPortal(
    <span className={styles.reactionFly} style={{ left: x, top: y }} aria-hidden="true">
      <Emoji emoji={emoji} size={28} />
    </span>,
    document.body,
  );
}

/** Строка сообщения — буквально `justify-content:{{m.align}}` из референса (строка 331):
 *  пузырь встаёт у своего края. Этап 6 достроил вокруг неё разведение жестов из
 *  gestures.md (тап/двойной тап/long-press/свайп-ответ), контекстное меню и мультивыбор. */
export function MessageRow({
  own,
  sender,
  withAvatarColumn,
  showAvatar,
  message,
  groupIds,
  reactions,
  chatId,
  myId,
  read,
  canEdit,
  canDelete,
  canPin,
  canReply,
  canReact,
  isPinned,
  onReply,
  onEdit,
  onForwardRequest,
  children,
}: MessageRowProps) {
  const isAlbum = groupIds.length > 1;

  const selectionMode = useChatStore((s) => s.selectionMode);
  const selected = useChatStore((s) =>
    isAlbum ? groupIds.every((id) => s.selectedIds.has(id)) : s.selectedIds.has(message.id),
  );
  const enterSelection = useChatStore((s) => s.enterSelection);
  const toggleSelected = useChatStore((s) => s.toggleSelected);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const deleteMessagesBatch = useChatStore((s) => s.deleteMessagesBatch);
  const pinMessage = useChatStore((s) => s.pinMessage);
  const doubleTapReaction = useReactionPrefsStore((s) => s.doubleTapReaction);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const suppressTapRef = useRef(false);
  /** Касание началось на кнопке внутри пузыря («Обновить» в объявлении, «Повторить» у
   *  неотправленного): строка не разбирает такое касание вовсе, иначе одно нажатие и
   *  нажимало бы кнопку, и открывало контекстное меню поверх открытого ею экрана. */
  const skipGesturesRef = useRef(false);
  const onSelectableRef = useRef(false);
  const mediaTapRef = useRef<{ tile: HTMLElement; x: number; y: number; epoch: number } | null>(null);
  const menuSeqRef = useRef(0);
  const pendingDeleteRef = useRef(false);
  const [menu, setMenu] = useState<{
    rect: DOMRect;
    origin: MenuOrigin | null;
    seq: number;
    selectedText: string | null;
  } | null>(null);
  const [reactionFly, setReactionFly] = useState<{ x: number; y: number; emoji: string; key: number } | null>(null);
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const [emojiAnchor, setEmojiAnchor] = useState<DOMRect | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasMediaBubble =
    /^(image|video)\//.test(message.attachment?.file.mimeType ?? '') ||
    message.localAttachment?.kind === 'image' ||
    message.localAttachment?.kind === 'video';

  const canAct = message.id > 0 && !message.deletedAt;

  function selectGroup(): void {
    enterSelection(message.id);
    for (const id of groupIds) {
      if (id !== message.id) toggleSelected(id);
    }
  }

  function deleteGroup(): Promise<void> {
    if (groupIds.length > 1) return deleteMessagesBatch(chatId, groupIds);
    return deleteMessage(chatId, message.id);
  }

  function handleConfirmDelete(): void {
    setConfirmDelete(false);
    deleteGroup().catch(() => {});
  }

  function toggleGroupSelected(): void {
    const { selectedIds } = useChatStore.getState();
    const target = !groupIds.every((id) => selectedIds.has(id));
    for (const id of groupIds) {
      if (selectedIds.has(id) !== target) toggleSelected(id);
    }
  }

  const longPress = useLongPress({
    onLongPress: () => {
      suppressTapRef.current = true;
      tap.cancel();
      haptic();
      selectGroup();
    },
    disabled: () => selectionMode || menu !== null || !canAct,
  });

  const tap = useTapGesture({
    onSingleTap: (pointerType) => {
      if (suppressTapRef.current) {
        suppressTapRef.current = false;
        return;
      }
      if (selectionMode) {
        toggleGroupSelected();
        return;
      }
      if (pointerType === 'mouse') return;
      if (!canAct) return;
      openMenu(null);
    },
    onDoubleTap: (point) => {
      if (suppressTapRef.current) {
        suppressTapRef.current = false;
        return;
      }
      if (selectionMode || !canAct || !canReact) return;
      if (point.pointerType === 'mouse' && onSelectableRef.current) return;
      haptic();
      toggleReaction(chatId, message.id, doubleTapReaction);
      setReactionFly({ x: point.x, y: point.y, emoji: doubleTapReaction, key: Date.now() });
    },
  });

  const swipe = useSwipeAction<HTMLDivElement>({
    onTrigger: () => {
      haptic();
      onReply(message);
    },
    disabled: () => selectionMode || !canAct || !canReply,
  });

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    suppressTapRef.current = false;
    const target = event.target as HTMLElement;
    const isMouse = event.pointerType === 'mouse';
    const albumTileSelector = 'button, a[download]';
    const singleTileSelector = 'button:not([data-media-tile]), a[download]';
    skipGesturesRef.current =
      (isMouse && event.button !== 0) ||
      target.closest(isAlbum ? albumTileSelector : singleTileSelector) !== null;
    if (skipGesturesRef.current) return;

    const tile = target.closest<HTMLElement>('[data-media-tile]');
    mediaTapRef.current = tile
      ? { tile, x: event.clientX, y: event.clientY, epoch: currentScrollEpoch() }
      : null;

    longPress.onPointerDown(event);
    if (!isMouse) swipe.onPointerDown(event);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (skipGesturesRef.current) return;
    longPress.onPointerMove(event);
    swipe.onPointerMove(event);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (skipGesturesRef.current) {
      skipGesturesRef.current = false;
      return;
    }

    longPress.onPointerUp();
    const wasDrag = swipe.onPointerUp();
    const mediaTap = mediaTapRef.current;
    mediaTapRef.current = null;
    // Свайп-ответ уже сработал — тап-жест не проверяет пройденное расстояние сам по себе,
    // и без этой проверки отпускание пальца после свайпа открывало контекстное меню
    // повторно (ux-ui.md, журнал, этап 6).
    if (wasDrag) {
      tap.cancel();
      return;
    }

    if (mediaTap) {
      tap.cancel();
      const suppressed = suppressTapRef.current;
      suppressTapRef.current = false;
      const strayed = exceedsMoveThreshold(event.clientX - mediaTap.x, event.clientY - mediaTap.y);
      if (suppressed || strayed || mediaTap.epoch !== currentScrollEpoch()) return;
      if (selectionMode) {
        toggleGroupSelected();
        return;
      }
      const mediaId = mediaTap.tile.dataset.mediaId;
      if (mediaId && canAct) openMediaViewer(chatId, mediaId);
      return;
    }

    onSelectableRef.current = (event.target as HTMLElement).closest('[data-selectable]') !== null;
    tap.onPointerUp(event);
  }

  function openMenu(origin: MenuOrigin | null): void {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    menuSeqRef.current += 1;
    setMenu({
      rect: bubble.getBoundingClientRect(),
      origin,
      seq: menuSeqRef.current,
      selectedText: selectedTextIn(bubble),
    });
  }

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>): void {
    const bubble = bubbleRef.current;
    if (event.button !== 2 || !bubble) return;
    if (!bubble.contains(event.target as Node)) return;
    event.preventDefault();
    if (selectionMode || !canAct) return;
    tap.cancel();
    longPress.onPointerCancel();
    openMenu({ x: event.clientX, y: event.clientY });
  }

  function handlePointerCancel(): void {
    mediaTapRef.current = null;
    if (skipGesturesRef.current) {
      skipGesturesRef.current = false;
      return;
    }

    longPress.onPointerCancel();
    swipe.onPointerCancel();
    tap.cancel();
  }

  useEffect(() => {
    if (menu === null && pendingDeleteRef.current) {
      pendingDeleteRef.current = false;
      setConfirmDelete(true);
    }
  }, [menu]);

  const items = useMemo<MessageMenuItem[]>(() => {
    const list: MessageMenuItem[] = canReply
      ? [{ id: 'reply', icon: 'reply', label: 'Ответить', onSelect: () => onReply(message) }]
      : [];

    const deleteItem: MessageMenuItem = {
      id: 'delete',
      icon: 'trash',
      label: 'Удалить',
      danger: true,
      onSelect: () => {
        pendingDeleteRef.current = true;
      },
    };

    if (message.type === 'CALL' || message.announcement) {
      if (message.announcement) {
        list.push({ id: 'forward', icon: 'forward', label: 'Переслать', onSelect: () => onForwardRequest(groupIds) });
      }
      if (canDelete) list.push(deleteItem);
      list.push({ id: 'select', icon: 'check', label: 'Выделить', onSelect: selectGroup });
      return list;
    }

    if (message.content) {
      const selected = menu?.selectedText ?? null;
      list.push({
        id: 'copy',
        icon: 'copy',
        label: selected ? 'Копировать выделенное' : 'Копировать',
        onSelect: () => void copyToClipboard(selected ?? message.content!),
      });
    }

    list.push({ id: 'forward', icon: 'forward', label: 'Переслать', onSelect: () => onForwardRequest(groupIds) });

    if (canPin) {
      list.push({
        id: 'pin',
        icon: 'pin',
        label: isPinned ? 'Открепить' : 'Закрепить',
        onSelect: () => pinMessage(chatId, isPinned ? null : message.id),
      });
    }

    if (canEdit) list.push({ id: 'edit', icon: 'edit', label: 'Изменить', onSelect: () => onEdit(message) });

    if (canDelete) list.push(deleteItem);

    if (isAlbum) list.push({ id: 'select', icon: 'check', label: 'Выделить всё', onSelect: selectGroup });

    return list;
  }, [
    message,
    menu,
    groupIds,
    isAlbum,
    chatId,
    canPin,
    canEdit,
    canDelete,
    canReply,
    isPinned,
    onReply,
    onEdit,
    onForwardRequest,
    pinMessage,
    selectGroup,
  ]);

  const myReactions = useMemo(() => {
    if (!myId) return new Set<string>();
    return new Set(reactions.filter((r) => r.userIds.includes(myId)).map((r) => r.emoji));
  }, [reactions, myId]);

  return (
    <div
      className={`message-wrap ${styles.row} ${own ? styles.own : ''} ${selected ? styles.selected : ''}`}
      data-message-id={message.id}
      ref={swipe.ref}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
    >
      <span className={styles.highlight} aria-hidden="true" />

      <span className={`${styles.checkboxSlot} ${selectionMode ? styles.checkboxActive : ''}`}>
        {selectionMode && (
          <span className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ''}`} aria-hidden="true">
            {selected && <Icon name="check" size={14} />}
          </span>
        )}
      </span>

      <div className={styles.swipeContent}>
        {!own && withAvatarColumn && (
          <span className={styles.avatarSlot}>
            {showAvatar && sender && (
              <Avatar label={sender.displayName} avatarUrl={sender.avatarUrl} size={36} color={sender.avatarColor} />
            )}
          </span>
        )}
        <div className={`${styles.bubbleCol} ${hasMediaBubble ? styles.bubbleColMedia : ''}`} ref={bubbleRef}>
          {children}
        </div>
      </div>

      <span className={styles.swipeIcon} aria-hidden="true">
        <Icon name="reply" size={16} />
      </span>

      {menu && (
        <MessageContextMenu
          key={menu.seq}
          anchorRect={menu.rect}
          origin={menu.origin}
          bubble={children}
          own={own}
          statusLabel={statusLabelFor(message, own, read)}
          myReactions={myReactions}
          onReact={(emoji) => toggleReaction(chatId, message.id, emoji)}
          onExpandReactions={() => {
            setEmojiAnchor(menu.rect);
            setEmojiPanelOpen(true);
          }}
          reactable={canReact}
          items={items}
          onClose={() => setMenu((current) => (current?.seq === menu.seq ? null : current))}
        />
      )}

      {emojiPanelOpen && (
        <EmojiPanel
          anchor={emojiAnchor}
          onSelect={(emoji) => {
            toggleReaction(chatId, message.id, emoji);
            setEmojiPanelOpen(false);
          }}
          onClose={() => setEmojiPanelOpen(false)}
        />
      )}

      {reactionFly && (
        <ReactionFly
          key={reactionFly.key}
          x={reactionFly.x}
          y={reactionFly.y}
          emoji={reactionFly.emoji}
          onDone={() => setReactionFly(null)}
        />
      )}

      {confirmDelete &&
        createPortal(
          <DeleteMessageModal count={groupIds.length} onCancel={() => setConfirmDelete(false)} onConfirm={handleConfirmDelete} />,
          document.body,
        )}
    </div>
  );
}
