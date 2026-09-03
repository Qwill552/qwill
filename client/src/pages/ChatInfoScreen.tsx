import type { UserProfileDto } from '@messenger/shared';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { createReportRequest } from '../api/admin';
import { getUserProfileRequest } from '../api/users';
import { AmbientBlobs } from '../app/AmbientBlobs';
import { ProfileCardFrame } from '../features/profile/ProfileCardFrame';
import { ChatMediaTabs } from '../features/chat/ChatMediaTabs';
import { openAvatarViewer } from '../features/media/avatarViewerStore';
import { ReportSheet } from '../features/reports/ReportSheet';
import { useCallStore } from '../stores/callStore';
import { useChatStore } from '../stores/chatStore';
import { formatBirthday, formatLastSeen } from '../utils/presence';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { Icon } from '../ui/Icon';
import { Menu, type MenuItem } from '../ui/Menu';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import styles from './ChatInfoScreen.module.css';

const COPIED_MS = 1500;

export function ChatInfoScreen() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [usernameCopied, setUsernameCopied] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [attachmentSummary, setAttachmentSummary] = useState<string | null>(null);
  const [fastScrollActive, setFastScrollActive] = useState(false);

  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const setChatMuted = useChatStore((s) => s.setChatMuted);
  const startCall = useCallStore((s) => s.startCall);

  const other = chat?.otherMember ?? null;
  const presence = other ? presenceByUser[other.id] : undefined;
  const online = presence?.online ?? false;
  const muted = chat?.muted ?? false;

  useEffect(() => {
    const otherId = chat?.otherMember?.id;
    if (!otherId) return;
    let cancelled = false;
    getUserProfileRequest(otherId)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chat?.otherMember?.id]);

  useEffect(() => {
    if (!usernameCopied) return;
    const timer = window.setTimeout(() => setUsernameCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [usernameCopied]);

  if (!chatId || !other) return null;

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
    <div className={styles.screen}>
      <AmbientBlobs />
      <div ref={scrollerRef} className={`${styles.scroller} hide-native-scrollbar`}>
        {!fastScrollActive && <ScrollIndicator target={scrollerRef} />}
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

        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => navigate(`/chats/${chatId}`)}>
            <Icon name="chat-filled" size={22} solid className={styles.actionIcon} />
            Чат
          </button>
          <button
            type="button"
            className={styles.action}
            aria-pressed={muted}
            onClick={() => {
              setChatMuted(chatId, !muted).catch(() => undefined);
            }}
          >
            <Icon name={muted ? 'mute' : 'bell-filled'} size={22} solid={!muted} className={styles.actionIcon} />
            Звук
          </button>
          <button type="button" className={styles.action} onClick={() => void startCall(chatId, 'AUDIO')}>
            <Icon name="phone-filled" size={22} solid className={styles.actionIcon} />
            Звонок
          </button>
          <button
            type="button"
            className={styles.action}
            aria-haspopup="menu"
            aria-expanded={menuAnchor !== null}
            onClick={(event: MouseEvent<HTMLButtonElement>) =>
              setMenuAnchor(event.currentTarget.getBoundingClientRect())
            }
          >
            <Icon name="more-horizontal" size={22} className={styles.actionIcon} />
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

        <ChatMediaTabs
          chatId={chatId}
          onHeaderLabel={setAttachmentSummary}
          onFastScroll={setFastScrollActive}
        />
      </div>

      <ChromeBar>
        <GlassButton icon="back" label="Назад к чату" onClick={() => navigate(`/chats/${chatId}`)} />
        {attachmentSummary && (
          <GlassPill
            className={styles.headerPill}
            title={other.displayName}
            subtitle={attachmentSummary}
          />
        )}
      </ChromeBar>

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
