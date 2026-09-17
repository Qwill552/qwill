import { ANNOUNCEMENT_PREVIEW_TEXT, isPlayableVideoMimeType, type ChatListItemDto } from '@messenger/shared';
import { useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { callPreviewText, callSymbolIcon, isUnansweredCall } from '../calls/callLog';
import { OfficialMark } from '../chat/OfficialMark';
import { isServiceChat, SERVICE_AVATAR_SRC } from '../chat/serviceChat';
import { parseEmoji } from '../emoji/parseEmoji';
import { formatChatRowWhen } from '../messages/dayLabel';
import { isVoiceAttachment } from '../messages/Attachment';
import { useLayoutMode } from '../../app/useLayoutMode';
import { useChatStore } from '../../stores/chatStore';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { haptic } from '../../ui/haptic';
import { Icon, type IconName } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import styles from './ChatRow.module.css';
import { DeleteChatModal } from './DeleteChatModal';

interface ChatRowProps {
  chat: ChatListItemDto;
  online: boolean;
  /** Кто печатает в этом чате прямо сейчас; непустой список вытесняет превью. */
  typingNames: string[];
  myUserId: string | null;
  /** Порядковый номер в списке — задержка входной анимации, буквально i*0.045s из референса. */
  index: number;
}

function isVoice(chat: ChatListItemDto): boolean {
  const attachment = chat.lastMessage?.attachment;
  if (!attachment) return false;
  return isVoiceAttachment(attachment) || attachment.file.mimeType.startsWith('audio/');
}

function isImage(chat: ChatListItemDto): boolean {
  return chat.lastMessage?.attachment?.file.mimeType.startsWith('image/') ?? false;
}

function isVideo(chat: ChatListItemDto): boolean {
  const mimeType = chat.lastMessage?.attachment?.file.mimeType;
  return mimeType !== undefined && isPlayableVideoMimeType(mimeType);
}

function attachmentIcon(chat: ChatListItemDto, own: boolean): IconName | null {
  const last = chat.lastMessage;
  if (last && !last.deletedAt && last.call) return callSymbolIcon(last.call, own);
  if (!last?.attachment) return null;
  if (isVoice(chat)) return 'mic';
  if (isImage(chat)) return 'camera';
  if (isVideo(chat)) return 'image';
  return 'attach';
}

function previewText(chat: ChatListItemDto, own: boolean): string {
  const last = chat.lastMessage;
  if (!last) return 'Нет сообщений';
  if (last.call) return callPreviewText(last.call, own);
  if (last.announcement) return ANNOUNCEMENT_PREVIEW_TEXT;
  if (last.content) return last.content;
  if (last.attachment) {
    if (isVoice(chat)) return 'Голосовое сообщение';
    if (isImage(chat)) return 'Фото';
    if (isVideo(chat)) return 'Видео';
    return last.attachment.originalName || 'Файл';
  }
  return 'Нет сообщений';
}

export function ChatRow({ chat, online, typingNames, myUserId, index }: ChatRowProps) {
  const navigate = useNavigate();
  const layout = useLayoutMode();
  const setChatMuted = useChatStore((s) => s.setChatMuted);
  const primeChatFromCache = useChatStore((s) => s.primeChatFromCache);
  const rowRef = useRef<HTMLAnchorElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  /** Долгое нажатие уже открыло меню — отпускание пальца не должно вдобавок увести в чат. */
  const suppressNavigationRef = useRef(false);

  const isService = isServiceChat(chat);

  function openMenu(): void {
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect) setMenuAnchor(rect);
  }

  const longPress = useLongPress({
    onLongPress: () => {
      suppressNavigationRef.current = true;
      haptic();
      openMenu();
    },
    disabled: () => menuAnchor !== null,
  });

  const muteItem: MenuItem = {
    id: 'mute',
    label: chat.muted ? 'Включить уведомления' : 'Отключить уведомления',
    icon: chat.muted ? 'mute' : 'bell',
    muted: chat.muted,
    onSelect: () => {
      setChatMuted(chat.id, !chat.muted).catch(() => undefined);
    },
  };

  const profileItem: MenuItem = {
    id: 'profile',
    label: 'Профиль',
    icon: 'user-circle',
    onSelect: () => {
      if (chat.type === 'GROUP') navigate(`/chats/${chat.id}`, { state: { openPanel: true } });
      else navigate(`/chats/${chat.id}/info`);
    },
  };

  const deleteItem: MenuItem = {
    id: 'delete',
    label: 'Удалить чат',
    icon: 'trash',
    danger: true,
    onSelect: () => setDeleteModalOpen(true),
  };

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
    <>
      <NavLink
        ref={rowRef}
        to={`/chats/${chat.id}`}
        className={({ isActive }) => `${styles.row} ${isActive ? styles.active : ''}`}
        data-chat-id={chat.id}
        data-unread={chat.unreadCount > 0 ? 'true' : undefined}
        style={{ animationDelay: `${index * 0.045}s` }}
        onPointerDown={(event) => {
          suppressNavigationRef.current = false;
          void primeChatFromCache(chat.id);
          longPress.onPointerDown(event);
        }}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        onPointerCancel={longPress.onPointerCancel}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu();
        }}
        onClick={(event) => {
          if (!suppressNavigationRef.current) return;
          suppressNavigationRef.current = false;
          event.preventDefault();
        }}
      >
        <Avatar
          label={chat.title}
          avatarUrl={chat.avatarUrl}
          imageSrc={isService ? SERVICE_AVATAR_SRC : undefined}
          size={layout === 'desktop' ? 48 : 52}
          online={online}
          color={chat.otherMember?.avatarColor}
          colorKey={chat.id}
          shadow
        />
        <div className={styles.body}>
          <div className={styles.top}>
            {/* Обёртка нужна из-за flex:1 у названия: без неё галочка «официальный» уезжала
                бы к правому краю строки, а не стояла сразу за названием. */}
            <span className={styles.titleWrap}>
              <span className={styles.title}>{chat.title}</span>
              {isService && <OfficialMark />}
            </span>
            {/* Пока сервер не отдаёт курсоры прочтения в списке чатов, честная отметка одна:
                «отправлено». Двойная галочка появится вместе с этими данными. */}
            {own && !typing && <Icon name="check" size={15} className={styles.sentMark} />}
            {last && <span className={styles.time}>{formatChatRowWhen(last.createdAt)}</span>}
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
            <Badge count={chat.unreadCount} muted={chat.muted} />
          </div>
        </div>
      </NavLink>

      {/* Вне NavLink: React пропускает события портала по дереву компонентов, и пункт меню,
          отрисованный его ребёнком, заодно уводил бы в чат. */}
      {menuAnchor && (
        <Menu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          items={isService ? [muteItem] : chat.type === 'GROUP' ? [profileItem, muteItem] : [profileItem, muteItem, deleteItem]}
        />
      )}

      {deleteModalOpen && <DeleteChatModal chat={chat} onClose={() => setDeleteModalOpen(false)} />}
    </>
  );
}
