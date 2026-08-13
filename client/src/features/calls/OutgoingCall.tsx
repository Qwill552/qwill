import { useEffect } from 'react';

import { startRingback, stopRingback } from '../../calls/ringtone';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { Avatar } from '../../ui/Avatar';
import { CallControls } from './CallControls';
import styles from './OutgoingCall.module.css';

const QUALITY_RING_CLASS: Record<'good' | 'poor' | 'lost', string | undefined> = {
  good: undefined,
  poor: styles.ringPoor,
  lost: styles.ringLost,
};

export function OutgoingCall() {
  const call = useCallStore((s) => s.call);
  const micEnabled = useCallStore((s) => s.micEnabled);
  const speakerEnabled = useCallStore((s) => s.speakerEnabled);
  const connectionQuality = useCallStore((s) => s.connectionQuality);
  const error = useCallStore((s) => s.error);
  const hangUp = useCallStore((s) => s.hangUp);
  const toggleMic = useCallStore((s) => s.toggleMic);
  const toggleSpeaker = useCallStore((s) => s.toggleSpeaker);

  const myId = useAuthStore((s) => s.user?.id) ?? null;

  useEffect(() => {
    startRingback();
    return () => stopRingback();
  }, []);

  const otherMember = call?.participants.find((p) => p.user.id !== myId)?.user ?? null;
  const displayName = otherMember?.displayName ?? '…';

  return (
    <div className={styles.screen}>
      <div className={styles.body}>
        <div className={`${styles.avatarRing} ${QUALITY_RING_CLASS[connectionQuality] ?? ''}`}>
          <Avatar label={displayName} avatarUrl={otherMember?.avatarUrl} size={128} color={otherMember?.avatarColor} colorKey={otherMember?.id} />
        </div>
        <h1 className={styles.name}>{displayName}</h1>
        <p className={`${styles.status} ${error ? styles.statusError : ''}`}>{error ?? 'Звоним…'}</p>
      </div>

      <div className={styles.bottom}>
        <CallControls
          micEnabled={micEnabled}
          onToggleMic={() => void toggleMic()}
          speakerEnabled={speakerEnabled}
          onToggleSpeaker={toggleSpeaker}
          onHangUp={() => void hangUp()}
        />
      </div>
    </div>
  );
}
