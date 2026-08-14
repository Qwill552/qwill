import { useCallStore } from '../../stores/callStore';
import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../../ui/Avatar';
import { IconButton } from '../../ui/IconButton';
import { CallControls } from './CallControls';
import styles from './CallScreen.module.css';
import { useCallDuration } from './useCallDuration';

interface CallScreenProps {
  onCollapse?: () => void;
}

const QUALITY_RING_CLASS: Record<'good' | 'poor' | 'lost', string | undefined> = {
  good: undefined,
  poor: styles.ringPoor,
  lost: styles.ringLost,
};

export function CallScreen({ onCollapse }: CallScreenProps) {
  const phase = useCallStore((s) => s.phase);
  const call = useCallStore((s) => s.call);
  const micEnabled = useCallStore((s) => s.micEnabled);
  const audioRoute = useCallStore((s) => s.audioRoute);
  const connectionQuality = useCallStore((s) => s.connectionQuality);
  const startedAt = useCallStore((s) => s.startedAt);
  const error = useCallStore((s) => s.error);
  const hangUp = useCallStore((s) => s.hangUp);
  const toggleMic = useCallStore((s) => s.toggleMic);
  const toggleAudioRoute = useCallStore((s) => s.toggleAudioRoute);

  const myId = useAuthStore((s) => s.user?.id) ?? null;
  const duration = useCallDuration(startedAt);

  const otherMember = call?.participants.find((p) => p.user.id !== myId)?.user ?? null;
  const displayName = otherMember?.displayName ?? '…';

  let statusText = '';
  if (error) statusText = error;
  else if (phase === 'ended') statusText = 'Звонок завершён';
  else if (phase === 'active') statusText = duration ?? '00:00';

  return (
    <div className={styles.screen}>
      {onCollapse && (
        <div className={styles.top}>
          <IconButton icon="chevron-down" label="Свернуть звонок" variant="plain" onClick={onCollapse} />
        </div>
      )}

      <div className={styles.body}>
        <div className={`${styles.avatarRing} ${QUALITY_RING_CLASS[connectionQuality] ?? ''}`}>
          <Avatar label={displayName} avatarUrl={otherMember?.avatarUrl} size={128} color={otherMember?.avatarColor} colorKey={otherMember?.id} />
        </div>
        <h1 className={styles.name}>{displayName}</h1>
        <p className={`${styles.status} ${error ? styles.statusError : ''}`}>{statusText}</p>
      </div>

      <div className={styles.bottom}>
        <CallControls
          micEnabled={micEnabled}
          onToggleMic={() => void toggleMic()}
          audioRoute={audioRoute}
          onToggleAudioRoute={toggleAudioRoute}
          onHangUp={() => void hangUp()}
        />
      </div>
    </div>
  );
}
