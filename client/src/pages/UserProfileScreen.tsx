import type { UserProfileDto } from '@messenger/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getUserProfileRequest } from '../api/users';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { ProfileCardFrame } from '../features/profile/ProfileCardFrame';
import { useChatStore } from '../stores/chatStore';
import { formatBirthday, formatLastSeen } from '../utils/presence';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import styles from './UserProfileScreen.module.css';

interface UserProfileScreenProps {
  backTo: string;
  backLabel: string;
  canMessage?: boolean;
}

export function UserProfileScreen({ backTo, backLabel, canMessage }: UserProfileScreenProps) {
  const { id, userId } = useParams<{ id: string; userId: string }>();
  const profileId = id ?? userId;
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const startPrivateChat = useChatStore((s) => s.startPrivateChat);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    getUserProfileRequest(profileId)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Профиль не открылся');
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  async function openChat(username: string): Promise<void> {
    setOpening(true);
    try {
      const chat = await startPrivateChat(username);
      navigate(`/chats/${chat.id}`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Чат не открылся');
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />

        {loadError && (
          <Card caption="Профиль">
            <Card.Row title="Не удалось открыть" subtitle={loadError} danger />
          </Card>
        )}

        {profile && (
          <>
            <div className={styles.hero}>
              <Avatar
                label={profile.displayName}
                avatarUrl={profile.avatarUrl}
                size={108}
                color={profile.avatarColor}
              />
              <span className={styles.name}>{profile.displayName}</span>
              <span className={styles.status}>{formatLastSeen(profile.lastSeenAt)}</span>
            </div>

            {canMessage && (
              <button
                type="button"
                className={styles.message}
                disabled={opening}
                onClick={() => void openChat(profile.username)}
              >
                Написать
              </button>
            )}

            {profile.cardUrl ? (
              <ProfileCardFrame
                cardUrl={profile.cardUrl}
                authorId={profile.id}
                authorName={profile.displayName}
                autoStart
              />
            ) : (
              profile.bio && (
                <Card caption="О себе">
                  <p className={styles.bioText}>{profile.bio}</p>
                </Card>
              )
            )}

            <Card>
              <Card.Row title={`@${profile.username}`} subtitle="Имя пользователя" icon="user" tint="blue" />
              {profile.birthday && (
                <Card.Row title="День рождения" value={formatBirthday(profile.birthday)} />
              )}
              {profile.phone && <Card.Row title="Телефон" value={profile.phone} />}
            </Card>
          </>
        )}
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label={backLabel} onClick={() => navigate(backTo)} />
        </ChromeBar>
      )}
    </div>
  );
}
