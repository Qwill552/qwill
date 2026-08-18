import type { ChatMemberSummary } from '@messenger/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { type LocalMessage, useChatStore } from '../../stores/chatStore';
import { useReactionPrefsStore } from '../../stores/reactionPrefsStore';
import { Avatar } from '../../ui/Avatar';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { useSwipeAction } from '../../ui/gestures/useSwipeAction';
import { useTapGesture } from '../../ui/gestures/useTapGesture';
import { haptic } from '../../ui/haptic';
import { Icon } from '../../ui/Icon';
import { Emoji } from '../emoji/Emoji';
import { EmojiPanel } from '../emoji/EmojiPanel';
import { MessageContextMenu, type MessageMenuItem } from './MessageContextMenu';
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
  const selectionMode = useChatStore((s) => s.selectionMode);
  const selected = useChatStore((s) => s.selectedIds.has(message.id));
  const enterSelection = useChatStore((s) => s.enterSelection);
  const toggleSelected = useChatStore((s) => s.toggleSelected);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const pinMessage = useChatStore((s) => s.pinMessage);
  const doubleTapReaction = useReactionPrefsStore((s) => s.doubleTapReaction);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const suppressTapRef = useRef(false);
  /** Касание началось на кнопке внутри пузыря («Обновить» в объявлении, «Повторить» у
   *  неотправленного): строка не разбирает такое касание вовсе, иначе одно нажатие и
   *  нажимало бы кнопку, и открывало контекстное меню поверх открытого ею экрана. */
  const onBubbleActionRef = useRef(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [reactionFly, setReactionFly] = useState<{ x: number; y: number; emoji: string; key: number } | null>(null);
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);

  const canAct = message.id > 0 && !message.deletedAt;

  const longPress = useLongPress({
    onLongPress: () => {
      suppressTapRef.current = true;
      tap.cancel();
      haptic();
      enterSelection(message.id);
    },
    disabled: () => selectionMode || menuAnchor !== null || !canAct,
  });

  const tap = useTapGesture({
    onSingleTap: () => {
      if (suppressTapRef.current) {
        suppressTapRef.current = false;
        return;
      }
      if (selectionMode) {
        toggleSelected(message.id);
        return;
      }
      if (!canAct) return;
      const rect = bubbleRef.current?.getBoundingClientRect();
      if (rect) setMenuAnchor(rect);
    },
    onDoubleTap: (point) => {
      if (suppressTapRef.current) {
        suppressTapRef.current = false;
        return;
      }
      if (selectionMode || !canAct || !canReact) return;
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
    onBubbleActionRef.current = (event.target as HTMLElement).closest('button') !== null;
    if (onBubbleActionRef.current) return;

    longPress.onPointerDown(event);
    swipe.onPointerDown(event);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (onBubbleActionRef.current) return;
    longPress.onPointerMove(event);
    swipe.onPointerMove(event);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (onBubbleActionRef.current) {
      onBubbleActionRef.current = false;
      return;
    }

    longPress.onPointerUp();
    const wasDrag = swipe.onPointerUp();
    // Свайп-ответ уже сработал — тап-жест не проверяет пройденное расстояние сам по себе,
    // и без этой проверки отпускание пальца после свайпа открывало контекстное меню
    // повторно (ux-ui.md, журнал, этап 6).
    if (wasDrag) {
      tap.cancel();
      return;
    }
    tap.onPointerUp(event);
  }

  function handlePointerCancel(): void {
    if (onBubbleActionRef.current) {
      onBubbleActionRef.current = false;
      return;
    }

    longPress.onPointerCancel();
    swipe.onPointerCancel();
    tap.cancel();
  }

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
        deleteMessage(chatId, message.id).catch(() => {
          // Удаление своего сообщения почти никогда не падает — тихо не ломаем интерфейс.
        });
      },
    };

    if (message.type === 'CALL' || message.announcement) {
      if (message.announcement) {
        list.push({ id: 'forward', icon: 'forward', label: 'Переслать', onSelect: () => onForwardRequest([message.id]) });
      }
      if (canDelete) list.push(deleteItem);
      list.push({ id: 'select', icon: 'check', label: 'Выделить', onSelect: () => enterSelection(message.id) });
      return list;
    }

    if (message.content) {
      list.push({ id: 'copy', icon: 'copy', label: 'Копировать', onSelect: () => void copyToClipboard(message.content!) });
    }

    list.push({ id: 'forward', icon: 'forward', label: 'Переслать', onSelect: () => onForwardRequest([message.id]) });

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

    return list;
  }, [
    message,
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
    deleteMessage,
    enterSelection,
  ]);

  const myReactions = useMemo(() => {
    if (!myId) return new Set<string>();
    return new Set(message.reactions.filter((r) => r.userIds.includes(myId)).map((r) => r.emoji));
  }, [message.reactions, myId]);

  return (
    <div
      className={`message-wrap ${styles.row} ${own ? styles.own : ''} ${selected ? styles.selected : ''}`}
      data-message-id={message.id}
      ref={swipe.ref}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
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
        <div className={styles.bubbleCol} ref={bubbleRef}>
          {children}
        </div>
      </div>

      <span className={styles.swipeIcon} aria-hidden="true">
        <Icon name="reply" size={16} />
      </span>

      {menuAnchor && (
        <MessageContextMenu
          anchorRect={menuAnchor}
          bubble={children}
          own={own}
          statusLabel={statusLabelFor(message, own, read)}
          myReactions={myReactions}
          onReact={(emoji) => toggleReaction(chatId, message.id, emoji)}
          onExpandReactions={() => setEmojiPanelOpen(true)}
          reactable={canReact}
          items={items}
          onClose={() => setMenuAnchor(null)}
        />
      )}

      {emojiPanelOpen && (
        <EmojiPanel
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
    </div>
  );
}
