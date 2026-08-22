import type { AttachmentDto } from '@messenger/shared';
import { useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useFileSrc } from '../api/useFileSrc';
import { AmbientBlobs } from '../app/AmbientBlobs';
import { useChatStore } from '../stores/chatStore';
import { formatLastSeen } from '../utils/presence';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { Icon } from '../ui/Icon';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import styles from './ChatInfoScreen.module.css';

function MediaThumb({ attachment }: { attachment: AttachmentDto }) {
  const src = useFileSrc(attachment.thumbnail?.id ?? attachment.file.id, attachment.thumbnail ? 'thumb' : 'full');
  return <img className={styles.mediaThumb} src={src} alt={attachment.originalName} loading="lazy" />;
}

/** Профиль собеседника — открывается тапом по капсуле шапки чата (см. ChatScreen).
 *  Раскладка и состав действий скопированы с профиля контакта Telegram, но без звонков и
 *  заглушения: их нет в объёме приложения (ux-ui.md, «Вне объёма» и «Звонки — позже»),
 *  а строка без работающей функции за ней — обман (см. журнал ux-ui.md, этап 11). */
export function ChatInfoScreen() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const messages = useChatStore((s) => (chatId ? s.messagesByChat[chatId] : undefined));

  const other = chat?.otherMember ?? null;
  const presence = other ? presenceByUser[other.id] : undefined;
  const online = presence?.online ?? false;

  const media = useMemo(() => {
    if (!messages) return [];
    return messages
      .filter((m) => m.attachment && /^(image|video)\//.test(m.attachment.file.mimeType))
      .map((m) => m.attachment as AttachmentDto)
      .reverse();
  }, [messages]);

  if (!chatId || !other) return null;

  return (
    <div className={styles.screen}>
      <AmbientBlobs />
      <div ref={scrollerRef} className={`${styles.scroller} hide-native-scrollbar`}>
        <ScrollIndicator target={scrollerRef} />
        <div className={styles.hero}>
          <Avatar label={other.displayName} avatarUrl={other.avatarUrl} size={108} color={other.avatarColor} />
          <span className={styles.name}>{other.displayName}</span>
          <span className={online ? styles.statusOnline : styles.status}>
            {online ? 'в сети' : formatLastSeen(presence?.lastSeenAt ?? other.lastSeenAt)}
          </span>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => navigate(`/chats/${chatId}`)}>
            <Icon name="chats" size={22} className={styles.actionIcon} />
            Написать
          </button>
        </div>

        <Card>
          <Card.Row title={`@${other.username}`} subtitle="Имя пользователя" icon="user" tint="blue" />
        </Card>

        {media.length > 0 && (
          <Card caption="Медиа">
            <div className={styles.mediaGrid}>
              {media.map((attachment) => (
                <MediaThumb key={attachment.id} attachment={attachment} />
              ))}
            </div>
          </Card>
        )}
      </div>

      <ChromeBar>
        <GlassButton icon="back" label="Назад к чату" onClick={() => navigate(`/chats/${chatId}`)} />
      </ChromeBar>
    </div>
  );
}
