import type { AvatarColor } from '@messenger/shared';

import { useParticipantVideo } from '../../calls/useParticipantVideo';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import styles from './ParticipantTile.module.css';

type ParticipantTileVariant = 'tile' | 'featured' | 'compact' | 'screen' | 'stage';

interface ParticipantTileProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor?: AvatarColor;
  micEnabled: boolean;
  isSpeaking: boolean;
  cameraEnabled: boolean;
  mirrored: boolean;
  variant: ParticipantTileVariant;
}

const AVATAR_SIZE: Record<ParticipantTileVariant, number> = {
  tile: 64,
  featured: 128,
  compact: 40,
  screen: 0,
  stage: 0,
};

function isScreenVariant(variant: ParticipantTileVariant): boolean {
  return variant === 'screen' || variant === 'stage';
}

export function ParticipantTile({
  userId,
  displayName,
  avatarUrl,
  avatarColor,
  micEnabled,
  isSpeaking,
  cameraEnabled,
  mirrored,
  variant,
}: ParticipantTileProps) {
  const isLocal = useAuthStore((s) => s.user?.id === userId);
  const showsScreen = isScreenVariant(variant);
  const videoRef = useParticipantVideo(userId, showsScreen || cameraEnabled, showsScreen ? 'screen' : 'camera');
  const size = AVATAR_SIZE[variant];

  if (showsScreen) {
    return (
      <div className={`${styles.tile} ${styles[variant]}`}>
        <div className={styles.screenFrame}>
          <video ref={videoRef} autoPlay playsInline muted className={styles.screenVideo} />
          <span className={styles.screenLabel}>
            <Icon name="monitor" size={12} />
            {displayName}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.tile} ${styles[variant]} ${isSpeaking ? styles.speaking : ''}`}>
      <div className={styles.avatarWrap}>
        <div className={styles.mediaWrap} style={{ width: size, height: size }}>
          <Avatar
            className={`${styles.media} ${cameraEnabled ? styles.mediaHidden : ''}`}
            label={displayName}
            avatarUrl={avatarUrl}
            color={avatarColor}
            colorKey={userId}
            size={size}
          />
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={`${styles.media} ${styles.video} ${mirrored ? styles.mirrored : ''} ${cameraEnabled ? '' : styles.mediaHidden}`}
          />
        </div>
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
