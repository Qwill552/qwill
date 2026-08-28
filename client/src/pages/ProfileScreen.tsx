import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { openAvatarViewer } from '../features/media/avatarViewerStore';
import { useAuthStore } from '../stores/authStore';
import { useUserProfileStore } from '../stores/userProfileStore';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { Icon, type IconName } from '../ui/Icon';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { formatBirthday } from '../utils/presence';
import styles from './ProfileScreen.module.css';

export function ProfileScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const user = useAuthStore((s) => s.user);
  const loadProfile = useUserProfileStore((s) => s.load);
  const storedProfile = useUserProfileStore((s) => s.profile);

  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.id) loadProfile(user.id);
  }, [user?.id, loadProfile]);

  const profile = storedProfile?.id === user?.id ? storedProfile : null;

  const actions: { icon: IconName; label: string; onClick: () => void }[] = [
    { icon: 'edit', label: 'Изменить', onClick: () => navigate('/profile/edit') },
    { icon: 'settings', label: 'Настройки', onClick: () => navigate('/settings') },
  ];

  const avatarUrl = user?.avatarUrl;

  return (
    <div className={styles.screen}>
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />
        <div className={styles.hero}>
          {avatarUrl ? (
            <button
              type="button"
              className={styles.avatarRing}
              onClick={() => openAvatarViewer(avatarUrl, user?.displayName ?? '')}
              aria-label="Открыть фото профиля"
            >
              <Avatar label={user?.displayName ?? '?'} avatarUrl={avatarUrl} size={107} color={user?.avatarColor} />
            </button>
          ) : (
            <div className={styles.avatarRing}>
              <Avatar label={user?.displayName ?? '?'} avatarUrl={undefined} size={107} color={user?.avatarColor} />
            </div>
          )}

          <span className={styles.name}>{user?.displayName}</span>
          <span className={styles.status}>в сети</span>
        </div>

        <div className={isDesktop ? card.actionRow : styles.actions}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={isDesktop ? card.actionTile : styles.action}
              onClick={action.onClick}
            >
              <Icon name={action.icon} size={23} className={isDesktop ? card.actionTileIcon : undefined} />
              {action.label}
            </button>
          ))}
        </div>

        {profile?.bio && (
          <Card caption="О себе">
            <p className={styles.bioText}>{profile.bio}</p>
          </Card>
        )}

        <Card className={styles.cardReset}>
          {profile?.phone && <Card.Row title={profile.phone} subtitle="Телефон" />}
          <Card.Row title={<span className={styles.accent}>{`@${user?.username ?? ''}`}</span>} subtitle="Имя пользователя" />
          {profile?.birthday && <Card.Row title={formatBirthday(profile.birthday)} subtitle="День рождения" />}
        </Card>
      </div>
    </div>
  );
}
