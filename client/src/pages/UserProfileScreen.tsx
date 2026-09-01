import type { UserProfileDto } from '@messenger/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getUserProfileRequest } from '../api/users';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { ProfileCardFrame } from '../features/profile/ProfileCardFrame';
import { formatBirthday, formatLastSeen } from '../utils/presence';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import styles from './UserProfileScreen.module.css';

export function UserProfileScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getUserProfileRequest(id)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Профиль не открылся');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
          <GlassButton icon="back" label="Назад в админ-панель" onClick={() => navigate('/admin')} />
        </ChromeBar>
      )}
    </div>
  );
}
