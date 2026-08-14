import { useCallStore } from '../../stores/callStore';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { IconButton } from '../../ui/IconButton';
import { CallControls } from './CallControls';
import { CallGrid } from './CallGrid';
import { ParticipantTile } from './ParticipantTile';
import { SelfView } from './SelfView';
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
  const participants = useCallStore((s) => s.participants);
  const activeSpeakerId = useCallStore((s) => s.activeSpeakerId);
  const micEnabled = useCallStore((s) => s.micEnabled);
  const cameraEnabled = useCallStore((s) => s.cameraEnabled);
  const audioRoute = useCallStore((s) => s.audioRoute);
  const connectionQuality = useCallStore((s) => s.connectionQuality);
  const startedAt = useCallStore((s) => s.startedAt);
  const error = useCallStore((s) => s.error);
  const cameraError = useCallStore((s) => s.cameraError);
  const hangUp = useCallStore((s) => s.hangUp);
  const toggleMic = useCallStore((s) => s.toggleMic);
  const toggleCamera = useCallStore((s) => s.toggleCamera);
  const toggleAudioRoute = useCallStore((s) => s.toggleAudioRoute);

  const myId = useAuthStore((s) => s.user?.id) ?? null;
  const chats = useChatStore((s) => s.chats);
  const duration = useCallDuration(startedAt);

  const chat = chats.find((c) => c.id === call?.chatId);
  const isGroup = chat?.type === 'GROUP';

  const otherMember = call?.participants.find((p) => p.user.id !== myId)?.user ?? null;
  const displayName = isGroup ? (chat?.title ?? '…') : (otherMember?.displayName ?? '…');
  const peerState = participants.find((p) => p.userId === otherMember?.id) ?? null;

  let statusText = '';
  if (error) statusText = error;
  else if (cameraError) statusText = cameraError;
  else if (phase === 'ended') statusText = 'Звонок завершён';
  else if (phase === 'active') statusText = duration ?? '00:00';

  return (
    <div className={styles.screen}>
      {onCollapse && (
        <div className={styles.top}>
          <IconButton icon="chevron-down" label="Свернуть звонок" variant="plain" onClick={onCollapse} />
        </div>
      )}

      {isGroup ? (
        <div className={styles.groupBody}>
          <p className={`${styles.status} ${error ? styles.statusError : ''}`}>{statusText}</p>
          <CallGrid participants={participants} call={call} activeSpeakerId={activeSpeakerId} />
        </div>
      ) : (
        <div className={styles.body}>
          <div className={`${styles.avatarRing} ${QUALITY_RING_CLASS[connectionQuality] ?? ''}`}>
            <ParticipantTile
              userId={otherMember?.id ?? ''}
              displayName={displayName}
              avatarUrl={otherMember?.avatarUrl ?? null}
              avatarColor={otherMember?.avatarColor}
              micEnabled={peerState?.micEnabled ?? true}
              isSpeaking={peerState?.isSpeaking ?? false}
              cameraEnabled={peerState?.cameraEnabled ?? false}
              variant="featured"
            />
          </div>
          <h1 className={styles.name}>{displayName}</h1>
          <p className={`${styles.status} ${error ? styles.statusError : ''}`}>{statusText}</p>
        </div>
      )}

      {!isGroup && cameraEnabled && <SelfView />}

      <div className={styles.bottom}>
        <CallControls
          micEnabled={micEnabled}
          onToggleMic={() => void toggleMic()}
          cameraEnabled={cameraEnabled}
          onToggleCamera={() => void toggleCamera()}
          audioRoute={audioRoute}
          onToggleAudioRoute={toggleAudioRoute}
          onHangUp={() => void hangUp()}
        />
      </div>
    </div>
  );
}
