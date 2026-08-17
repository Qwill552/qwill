import type { CallStatus } from '@messenger/shared';
import { useEffect } from 'react';

import { playCallEndedTone, startRingback, stopRingback } from '../../calls/ringtone';
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

function endedLabel(status: CallStatus): string {
  if (status === 'DECLINED') return 'Звонок отклонён';
  if (status === 'MISSED') return 'Не отвечает';
  return 'Звонок завершён';
}

export function OutgoingCall() {
  const call = useCallStore((s) => s.call);
  const phase = useCallStore((s) => s.phase);
  const micEnabled = useCallStore((s) => s.micEnabled);
  const audioRoute = useCallStore((s) => s.audioRoute);
  const connectionQuality = useCallStore((s) => s.connectionQuality);
  const error = useCallStore((s) => s.error);
  const hangUp = useCallStore((s) => s.hangUp);
  const toggleMic = useCallStore((s) => s.toggleMic);
  const toggleAudioRoute = useCallStore((s) => s.toggleAudioRoute);

  const myId = useAuthStore((s) => s.user?.id) ?? null;

  const ended = phase === 'ended';
  const answered = call?.status === 'ACTIVE';

  useEffect(() => {
    if (ended) {
      stopRingback();
      playCallEndedTone();
      return;
    }

    if (answered) {
      stopRingback();
      return;
    }

    startRingback();
    return () => stopRingback();
  }, [ended, answered]);

  const otherMember = call?.participants.find((p) => p.user.id !== myId)?.user ?? null;
  const displayName = otherMember?.displayName ?? '…';
  const ringingStatus = answered ? 'Соединяем…' : 'Звоним…';
  const status = ended ? endedLabel(call?.status ?? 'ENDED') : (error ?? ringingStatus);

  return (
    <div className={styles.screen}>
      <div className={styles.body}>
        <div className={`${styles.avatarRing} ${QUALITY_RING_CLASS[connectionQuality] ?? ''}`}>
          <Avatar label={displayName} avatarUrl={otherMember?.avatarUrl} size={128} color={otherMember?.avatarColor} colorKey={otherMember?.id} />
        </div>
        <h1 className={styles.name}>{displayName}</h1>
        <p className={`${styles.status} ${error && !ended ? styles.statusError : ''}`}>{status}</p>
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
