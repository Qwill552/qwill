import { useCallback, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { useCallStore } from '../../stores/callStore';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useParticipantVideo } from '../../calls/useParticipantVideo';
import { Avatar } from '../../ui/Avatar';
import { ChromeBar } from '../../ui/chrome/ChromeBar';
import { GlassButton } from '../../ui/chrome/GlassButton';
import { GlassPill } from '../../ui/chrome/GlassPill';
import { IconButton } from '../../ui/IconButton';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { CallControls } from './CallControls';
import { CallGrid } from './CallGrid';
import { CallStatsOverlay } from './CallStatsOverlay';
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

const STATS_STORAGE_KEY = 'qwill:call-stats';

function readStatsPreference(): boolean {
  try {
    return localStorage.getItem(STATS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStatsPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STATS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    return;
  }
}

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
  const peerCameraOn = !isGroup && (peerState?.cameraEnabled ?? false);
  const peerVideoRef = useParticipantVideo(otherMember?.id ?? '', peerCameraOn);

  const [statsVisible, setStatsVisible] = useState(readStatsPreference);
  const toggleStats = useCallback(() => {
    setStatsVisible((visible) => {
      writeStatsPreference(!visible);
      return !visible;
    });
  }, []);
  const longPress = useLongPress({ onLongPress: toggleStats });
  const onScreenPointerDown = (event: ReactPointerEvent): void => {
    if ((event.target as HTMLElement).closest('button, a, input')) return;
    longPress.onPointerDown(event);
  };

  let statusText = '';
  if (error) statusText = error;
  else if (cameraError) statusText = cameraError;
  else if (phase === 'ended') statusText = 'Звонок завершён';
  else if (phase === 'active') statusText = duration ?? '00:00';

  return (
    <div
      className={styles.screen}
      onPointerDown={onScreenPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
    >
      {phase === 'active' && statsVisible && <CallStatsOverlay />}

      {!isGroup && (
        <video
          ref={peerVideoRef}
          autoPlay
          playsInline
          className={`${styles.peerVideo} ${peerCameraOn ? styles.peerVideoVisible : ''}`}
        />
      )}

      {onCollapse &&
        (peerCameraOn ? (
          <ChromeBar>
            <GlassButton icon="chevron-down" label="Свернуть звонок" variant="chrome" onClick={onCollapse} />
            <GlassPill
              title={
                <span className={styles.pillRow}>
                  <span className={styles.pillName}>{displayName}</span>
                  <span className={`${styles.pillStatus} ${error ? styles.pillStatusError : ''}`}>{statusText}</span>
                </span>
              }
            />
          </ChromeBar>
        ) : (
          <div className={styles.top}>
            <IconButton icon="chevron-down" label="Свернуть звонок" variant="plain" onClick={onCollapse} />
          </div>
        ))}

      {isGroup ? (
        <div className={styles.groupBody}>
          <p className={`${styles.status} ${error ? styles.statusError : ''}`}>{statusText}</p>
          <CallGrid participants={participants} call={call} activeSpeakerId={activeSpeakerId} />
        </div>
      ) : (
        <div className={`${styles.body} ${peerCameraOn ? styles.bodyHidden : ''}`}>
          <div className={`${styles.avatarRing} ${QUALITY_RING_CLASS[connectionQuality] ?? ''}`}>
            <Avatar label={displayName} avatarUrl={otherMember?.avatarUrl} size={128} color={otherMember?.avatarColor} colorKey={otherMember?.id} />
          </div>
          <h1 className={styles.name}>{displayName}</h1>
          <p className={`${styles.status} ${error ? styles.statusError : ''}`}>{statusText}</p>
        </div>
      )}

      {!isGroup && cameraEnabled && <SelfView />}

      {peerCameraOn ? (
        <ChromeBar side="bottom" className={styles.bottomBar}>
          <CallControls
            glass
            micEnabled={micEnabled}
            onToggleMic={() => void toggleMic()}
            cameraEnabled={cameraEnabled}
            onToggleCamera={() => void toggleCamera()}
            audioRoute={audioRoute}
            onToggleAudioRoute={toggleAudioRoute}
            onHangUp={() => void hangUp()}
          />
        </ChromeBar>
      ) : (
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
      )}
    </div>
  );
}
