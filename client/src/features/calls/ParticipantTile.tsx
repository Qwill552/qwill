import type { AvatarColor } from '@messenger/shared';

import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import styles from './ParticipantTile.module.css';

type ParticipantTileVariant = 'tile' | 'featured' | 'compact';

interface ParticipantTileProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor?: AvatarColor;
  micEnabled: boolean;
  isSpeaking: boolean;
  variant: ParticipantTileVariant;
}

const AVATAR_SIZE: Record<ParticipantTileVariant, number> = {
  tile: 64,
  featured: 128,
  compact: 40,
};

export function ParticipantTile({ userId, displayName, avatarUrl, avatarColor, micEnabled, isSpeaking, variant }: ParticipantTileProps) {
  return (
    <div className={`${styles.tile} ${styles[variant]} ${isSpeaking ? styles.speaking : ''}`}>
      <div className={styles.avatarWrap}>
        <Avatar label={displayName} avatarUrl={avatarUrl} color={avatarColor} colorKey={userId} size={AVATAR_SIZE[variant]} />
        {!micEnabled && (
          <span className={styles.micBadge} title="Микрофон выключен">
            <Icon name="mic-off" size={12} />
          </span>
        )}
      </div>
      {variant !== 'compact' && <span className={styles.name}>{displayName}</span>}
    </div>
  );
}
