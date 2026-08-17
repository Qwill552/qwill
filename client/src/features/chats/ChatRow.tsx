import type { ChatListItemDto } from '@messenger/shared';
import { NavLink } from 'react-router-dom';

import { callPreviewText, callSymbolIcon, isUnansweredCall } from '../calls/callLog';
import { parseEmoji } from '../emoji/parseEmoji';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Icon, type IconName } from '../../ui/Icon';
import styles from './ChatRow.module.css';

interface ChatRowProps {
  chat: ChatListItemDto;
  online: boolean;
  /** Кто печатает в этом чате прямо сейчас; непустой список вытесняет превью. */
  typingNames: string[];
  myUserId: string | null;
  /** Порядковый номер в списке — задержка входной анимации, буквально i*0.045s из референса. */
  index: number;
}

/** Время последнего сообщения: сегодняшнее — часами, вчерашнее — «вчера», старше — датой.
 *  Иначе в списке из старых чатов все строки показывают одно и то же бессмысленное время. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'вчера';

  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function isImage(chat: ChatListItemDto): boolean {
  return chat.lastMessage?.attachment?.file.mimeType.startsWith('image/') ?? false;
}

/** Иконка типа вложения перед превью. Голосовые появятся на этапе 7 — тогда сюда добавится mic. */
function attachmentIcon(chat: ChatListItemDto, own: boolean): IconName | null {
  const last = chat.lastMessage;
  if (last && !last.deletedAt && last.call) return callSymbolIcon(last.call, own);
  if (!last?.attachment) return null;
  return isImage(chat) ? 'camera' : 'attach';
}

function previewText(chat: ChatListItemDto, own: boolean): string {
  const last = chat.lastMessage;
  if (!last) return 'Нет сообщений';
  if (last.deletedAt) return 'Сообщение удалено';
  if (last.call) return callPreviewText(last.call, own);
  if (last.content) return last.content;
  if (last.attachment) return isImage(chat) ? 'Фото' : last.attachment.originalName || 'Файл';
  return 'Нет сообщений';
}

export function ChatRow({ chat, online, typingNames, myUserId, index }: ChatRowProps) {
  const last = chat.lastMessage;
  const own = Boolean(last?.sender && myUserId && last.sender.id === myUserId);
  const isCall = Boolean(last?.call && !last.deletedAt);
  const icon = attachmentIcon(chat, own);
  const failedCall = Boolean(last?.call && !last.deletedAt && (isUnansweredCall(last.call) || last.call.status === 'DECLINED'));
  const typing = typingNames.length > 0;

  // В группе полезно видеть, кто написал; в личном чате это и так известно.
  const authorPrefix =
    isCall ? '' : own ? 'Вы: ' : chat.type === 'GROUP' && last?.sender ? `${last.sender.displayName}: ` : '';

  return (
    <NavLink
      to={`/chats/${chat.id}`}
      className={({ isActive }) => `${styles.row} ${isActive ? styles.active : ''}`}
      data-unread={chat.unreadCount > 0 ? 'true' : undefined}
      style={{ animationDelay: `${index * 0.045}s` }}
    >
      <Avatar
        label={chat.title}
        avatarUrl={chat.avatarUrl}
        size={52}
        online={online}
        color={chat.otherMember?.avatarColor}
        colorKey={chat.id}
        shadow
      />
      <div className={styles.body}>
        <div className={styles.top}>
          <span className={styles.title}>{chat.title}</span>
          {/* Пока сервер не отдаёт курсоры прочтения в списке чатов, честная отметка одна:
              «отправлено». Двойная галочка появится вместе с этими данными. */}
          {own && !typing && <Icon name="check" size={15} className={styles.sentMark} />}
          {last && <span className={styles.time}>{formatWhen(last.createdAt)}</span>}
        </div>
        <div className={styles.bottom}>
          {typing ? (
            <p className={styles.typing}>
              {chat.type === 'GROUP' ? `${typingNames.join(', ')} печатает…` : 'печатает…'}
            </p>
          ) : (
            <p className={styles.preview}>
              {icon && (
                <Icon
                  name={icon}
                  size={14}
                  className={`${styles.attachIcon} ${failedCall ? styles.failedCallIcon : ''}`}
                />
              )}
              {authorPrefix && <span className={styles.author}>{authorPrefix}</span>}
              {parseEmoji(previewText(chat, own))}
            </p>
          )}
          <Badge count={chat.unreadCount} />
        </div>
      </div>
    </NavLink>
  );
}
