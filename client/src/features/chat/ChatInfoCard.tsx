import type { AttachmentDto, UserProfileDto } from '@messenger/shared';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { getUserProfileRequest } from '../../api/users';
import { useCallStore } from '../../stores/callStore';
import { useChatStore } from '../../stores/chatStore';
import { formatBirthday, formatLastSeen } from '../../utils/presence';
import { openAvatarViewer } from '../media/avatarViewerStore';
import { ProfileCardFrame } from '../profile/ProfileCardFrame';
import card from '../../app/desktopCard.module.css';
import { Avatar } from '../../ui/Avatar';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import type { IconName } from '../../ui/icons/paths';
import { Menu, type MenuItem } from '../../ui/Menu';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import styles from './ChatInfoCard.module.css';

interface ChatInfoCardProps {
  chatId: string;
}

const COPIED_MS = 1500;

interface AttachmentTally {
  icon: IconName;
  label: string;
  count: number;
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function tally(attachments: AttachmentDto[]): AttachmentTally[] {
  let photos = 0;
  let videos = 0;
  let voices = 0;
  let audios = 0;
  let files = 0;

  for (const attachment of attachments) {
    const mimeType = attachment.file.mimeType;
    if (attachment.peaks !== null) voices += 1;
    else if (mimeType.startsWith('image/')) photos += 1;
    else if (mimeType.startsWith('video/')) videos += 1;
    else if (mimeType.startsWith('audio/')) audios += 1;
    else files += 1;
  }

  return [
    { icon: 'image', label: `${photos} ${plural(photos, 'фотография', 'фотографии', 'фотографий')}`, count: photos },
    { icon: 'video', label: `${videos} видео`, count: videos },
    {
      icon: 'mic',
      label: `${voices} ${plural(voices, 'голосовое сообщение', 'голосовых сообщения', 'голосовых сообщений')}`,
      count: voices,
    },
    {
      icon: 'headphones',
      label: `${audios} ${plural(audios, 'аудиофайл', 'аудиофайла', 'аудиофайлов')}`,
      count: audios,
    },
    { icon: 'file', label: `${files} ${plural(files, 'файл', 'файла', 'файлов')}`, count: files },
  ];
}

export function ChatInfoCard({ chatId }: ChatInfoCardProps) {
  const navigate = useNavigate();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [usernameCopied, setUsernameCopied] = useState(false);

  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const messages = useChatStore((s) => s.messagesByChat[chatId]);
  const setChatMuted = useChatStore((s) => s.setChatMuted);
  const startCall = useCallStore((s) => s.startCall);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);

  const other = chat?.otherMember ?? null;
  const presence = other ? presenceByUser[other.id] : undefined;
  const online = presence?.online ?? false;
  const muted = chat?.muted ?? false;

  useEffect(() => {
    if (!other?.id) return;
    let cancelled = false;
    getUserProfileRequest(other.id)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [other?.id]);

  const tallies = useMemo(() => {
    const attachments = (messages ?? [])
      .filter((m) => m.attachment && !m.deletedAt)
      .map((m) => m.attachment as AttachmentDto);
    return tally(attachments).filter((row) => row.count > 0);
  }, [messages]);

  useEffect(() => {
    if (!usernameCopied) return;
    const timer = window.setTimeout(() => setUsernameCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [usernameCopied]);

  if (!other) return null;

  const avatarUrl = other.avatarUrl;
  const usernameHandle = `@${other.username}`;

  async function copyUsername(): Promise<void> {
    try {
      await navigator.clipboard.writeText(usernameHandle);
      setUsernameCopied(true);
    } catch {
      setUsernameCopied(false);
    }
  }

  const menuItems: MenuItem[] = [
    { id: 'share', label: 'Поделиться контактом', icon: 'forward', onSelect: () => {} },
    { id: 'edit', label: 'Изменить контакт', icon: 'edit', onSelect: () => {} },
    { id: 'block', label: 'Заблокировать', icon: 'lock', onSelect: () => {} },
    { id: 'delete', label: 'Удалить контакт', icon: 'trash', danger: true, onSelect: () => {} },
  ];

  return (
    <div ref={scrollerRef} className={`${styles.scroller} ${card.root} hide-native-scrollbar`}>
      <ScrollIndicator target={scrollerRef} />
      <div className={styles.hero}>
        {avatarUrl ? (
          <button
            type="button"
            className={styles.avatarButton}
            onClick={() => openAvatarViewer(avatarUrl, other.displayName)}
            aria-label="Открыть фото профиля"
          >
            <Avatar label={other.displayName} avatarUrl={avatarUrl} size={108} color={other.avatarColor} />
          </button>
        ) : (
          <Avatar label={other.displayName} avatarUrl={avatarUrl} size={108} color={other.avatarColor} />
        )}
        <span className={styles.name}>{other.displayName}</span>
        <span className={online ? styles.statusOnline : styles.status}>
          {online ? 'в сети' : formatLastSeen(presence?.lastSeenAt ?? other.lastSeenAt)}
        </span>
      </div>

      <div className={`${styles.actions} ${card.actionRow}`}>
        <button type="button" className={card.actionTile} onClick={() => navigate(`/chats/${chatId}`)}>
          <Icon name="chat-filled" size={22} solid className={card.actionTileIcon} />
          Чат
        </button>
        <button
          type="button"
          className={card.actionTile}
          aria-pressed={muted}
          onClick={() => {
            setChatMuted(chatId, !muted).catch(() => undefined);
          }}
        >
          <Icon name={muted ? 'mute' : 'bell-filled'} size={22} solid={!muted} className={card.actionTileIcon} />
          Звук
        </button>
        <button type="button" className={card.actionTile} onClick={() => void startCall(chatId, 'AUDIO')}>
          <Icon name="phone-filled" size={22} solid className={card.actionTileIcon} />
          Звонок
        </button>
        <button
          type="button"
          className={card.actionTile}
          aria-haspopup="menu"
          aria-expanded={menuAnchor !== null}
          onClick={(event: MouseEvent<HTMLButtonElement>) =>
            setMenuAnchor(event.currentTarget.getBoundingClientRect())
          }
        >
          <Icon name="more-horizontal" size={22} className={card.actionTileIcon} />
          Ещё
        </button>
      </div>

      {profile?.cardUrl ? (
        <ProfileCardFrame
          cardUrl={profile.cardUrl}
          authorId={profile.id}
          authorName={profile.displayName}
          autoStart
        />
      ) : (
        profile?.bio && (
          <Card caption="О себе">
            <p className={styles.bioText}>{profile.bio}</p>
          </Card>
        )
      )}

      <Card>
        <Card.Row
          title={
            <button type="button" className={styles.username} onClick={() => void copyUsername()}>
              {usernameHandle}
            </button>
          }
          subtitle={usernameCopied ? 'Скопировано' : 'Имя пользователя'}
          icon="user"
          tint="blue"
        />
        {profile?.phone && <Card.Row title={profile.phone} subtitle="Телефон" icon="phone" tint="green" />}
        {profile?.birthday && (
          <Card.Row title={formatBirthday(profile.birthday)} subtitle="День рождения" icon="calendar" tint="orange" />
        )}
      </Card>

      {tallies.length > 0 && (
        <Card caption="Медиа">
          {tallies.map((row) => (
            <Card.Row
              key={row.icon}
              title={row.label}
              icon={row.icon}
              tint="blue"
              className={`${styles.tallyRow} ${card.tileStroke}`}
            />
          ))}
        </Card>
      )}

      {menuAnchor && (
        <Menu anchor={menuAnchor} onClose={() => setMenuAnchor(null)} items={menuItems} desktopWidth={246} />
      )}
    </div>
  );
}
