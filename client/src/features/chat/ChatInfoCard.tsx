import type { ChatAttachmentCategory, ChatAttachmentCounts, UserProfileDto } from '@messenger/shared';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { createReportRequest } from '../../api/admin';
import { getChatAttachmentCountsRequest } from '../../api/chats';
import { getUserProfileRequest } from '../../api/users';
import { useEscapeKey } from '../../app/hotkeys';
import { useCallStore } from '../../stores/callStore';
import { useChatStore } from '../../stores/chatStore';
import { formatBirthday, formatLastSeen } from '../../utils/presence';
import { openAvatarViewer } from '../media/avatarViewerStore';
import { ProfileCardFrame } from '../profile/ProfileCardFrame';
import card from '../../app/desktopCard.module.css';
import { Avatar } from '../../ui/Avatar';
import { Card } from '../../ui/Card';
import { GlassPill } from '../../ui/chrome/GlassPill';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import type { IconName } from '../../ui/icons/paths';
import { Menu, type MenuItem } from '../../ui/Menu';
import { ReportSheet } from '../reports/ReportSheet';
import { ChatMediaTabs } from './ChatMediaTabs';
import { plural } from './plural';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import styles from './ChatInfoCard.module.css';

interface ChatInfoCardProps {
  chatId: string;
}

const COPIED_MS = 1500;

interface AttachmentTally {
  id: string;
  icon: IconName;
  label: string;
  count: number;
  category: ChatAttachmentCategory;
}

function tally(counts: ChatAttachmentCounts): AttachmentTally[] {
  return [
    {
      id: 'photos',
      icon: 'image',
      label: `${counts.photos} ${plural(counts.photos, 'фотография', 'фотографии', 'фотографий')}`,
      count: counts.photos,
      category: 'media',
    },
    { id: 'videos', icon: 'video', label: `${counts.videos} видео`, count: counts.videos, category: 'media' },
    {
      id: 'gifs',
      icon: 'image',
      label: `${counts.gifs} ${plural(counts.gifs, 'гифка', 'гифки', 'гифок')}`,
      count: counts.gifs,
      category: 'gif',
    },
    {
      id: 'voices',
      icon: 'mic',
      label: `${counts.voices} ${plural(counts.voices, 'голосовое сообщение', 'голосовых сообщения', 'голосовых сообщений')}`,
      count: counts.voices,
      category: 'voice',
    },
    {
      id: 'audios',
      icon: 'headphones',
      label: `${counts.audios} ${plural(counts.audios, 'аудиофайл', 'аудиофайла', 'аудиофайлов')}`,
      count: counts.audios,
      category: 'file',
    },
    {
      id: 'files',
      icon: 'file',
      label: `${counts.files} ${plural(counts.files, 'файл', 'файла', 'файлов')}`,
      count: counts.files,
      category: 'file',
    },
  ];
}

export function ChatInfoCard({ chatId }: ChatInfoCardProps) {
  const navigate = useNavigate();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [usernameCopied, setUsernameCopied] = useState(false);
  const [reporting, setReporting] = useState(false);

  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const setChatMuted = useChatStore((s) => s.setChatMuted);
  const startCall = useCallStore((s) => s.startCall);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [counts, setCounts] = useState<ChatAttachmentCounts | null>(null);
  const [viewing, setViewing] = useState<ChatAttachmentCategory | null>(null);
  const [viewLabel, setViewLabel] = useState<string | null>(null);
  const [fastScrollActive, setFastScrollActive] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    getChatAttachmentCountsRequest(chatId)
      .then((result) => {
        if (!cancelled) setCounts(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => {
    setViewing(null);
  }, [chatId]);

  useEscapeKey(viewing !== null, () => setViewing(null));

  const tallies = useMemo(() => (counts ? tally(counts).filter((row) => row.count > 0) : []), [counts]);

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
    { id: 'report', label: 'Пожаловаться на профиль', icon: 'report', onSelect: () => setReporting(true) },
    { id: 'block', label: 'Заблокировать', icon: 'lock', onSelect: () => {} },
    { id: 'delete', label: 'Удалить контакт', icon: 'trash', danger: true, onSelect: () => {} },
  ];


  return (
    <div ref={scrollerRef} className={`${styles.scroller} ${card.root} hide-native-scrollbar`}>
      {!fastScrollActive && <ScrollIndicator target={scrollerRef} />}

      {viewing ? (
        <>
          <div className={styles.viewerHeader}>
            <IconButton icon="back" label="Назад к счётчикам" onClick={() => setViewing(null)} />
            <GlassPill variant="flat" title={other.displayName} subtitle={viewLabel ?? undefined} />
          </div>
          <ChatMediaTabs
            chatId={chatId}
            initialCategory={viewing}
            swipeable={false}
            headerLabelAlways
            onHeaderLabel={setViewLabel}
            onFastScroll={setFastScrollActive}
          />
        </>
      ) : (
        <>
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
              <Card.Row
                title={formatBirthday(profile.birthday)}
                subtitle="День рождения"
                icon="calendar"
                tint="orange"
              />
            )}
          </Card>

          {tallies.length > 0 && (
            <Card caption="Медиа">
              {tallies.map((row) => (
                <Card.Row
                  key={row.id}
                  title={row.label}
                  icon={row.icon}
                  tint="blue"
                  className={`${styles.tallyRow} ${card.tileStroke}`}
                  onClick={() => setViewing(row.category)}
                />
              ))}
            </Card>
          )}
        </>
      )}

      {menuAnchor && (
        <Menu anchor={menuAnchor} onClose={() => setMenuAnchor(null)} items={menuItems} desktopWidth={246} />
      )}

      {reporting && (
        <ReportSheet
          hint={`Жалоба на профиль @${other.username}: имя, фото, «О себе», оформление.`}
          note="Это не жалоба на переписку. Если дело в том, что вам пишут или присылают, пожалуйтесь из самого чата: «…» в шапке → «Пожаловаться на переписку»."
          onClose={() => setReporting(false)}
          onSend={(comment) =>
            createReportRequest({ targetUserId: other.id, kind: 'profile', comment }).then(() => undefined)
          }
        />
      )}
    </div>
  );
}
