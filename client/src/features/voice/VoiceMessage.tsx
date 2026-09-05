import type { AttachmentDto } from '@messenger/shared';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { Icon } from '../../ui/Icon';
import { MessageMeta } from '../messages/MessageMeta';
import { useVoicePlayback } from './useVoicePlayback';
import styles from './VoiceMessage.module.css';

const FALLBACK_PEAKS = Array.from({ length: 32 }, (_, i) => 0.3 + 0.25 * Math.abs(Math.sin(i * 0.7)));
const SPEED_STEPS = [1, 1.5, 2] as const;

function stopPointerBubble(event: ReactPointerEvent): void {
  event.stopPropagation();
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

interface VoiceMessageProps {
  attachment: AttachmentDto;
  own: boolean;
  chatId: string;
  createdAt: string;
  edited: boolean;
  status: 'sending' | 'sent' | 'failed';
  read: boolean;
}

export function VoiceMessage({ attachment, own, chatId, createdAt, edited, status, read }: VoiceMessageProps) {
  const { src, audioRef, playing, progress, durationMs, unheard, togglePlay, seekTo } = useVoicePlayback(
    attachment,
    own,
    chatId,
  );
  const waveRef = useRef<HTMLDivElement>(null);
  const [speedIndex, setSpeedIndex] = useState(0);

  const peaks = attachment.peaks && attachment.peaks.length > 0 ? attachment.peaks : FALLBACK_PEAKS;

  function cycleSpeed(): void {
    const nextIndex = (speedIndex + 1) % SPEED_STEPS.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) audioRef.current.playbackRate = SPEED_STEPS[nextIndex]!;
  }

  function seekFromClientX(clientX: number): void {
    const wave = waveRef.current;
    if (!wave) return;
    const rect = wave.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seekTo(ratio);
  }

  function handleWavePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    stopPointerBubble(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.clientX);
  }

  function handleWavePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    stopPointerBubble(event);
    if (event.buttons === 0) return;
    seekFromClientX(event.clientX);
  }

  const ownClass = own ? styles.own : '';

  return (
    <>
      <div className={`${styles.head} ${ownClass}`}>
        <audio ref={audioRef} src={src} preload="none" />
        <button
          type="button"
          className={styles.playButton}
          onClick={togglePlay}
          onPointerDown={stopPointerBubble}
          onPointerUp={stopPointerBubble}
          onPointerCancel={stopPointerBubble}
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        >
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>

        <div
          ref={waveRef}
          className={styles.wave}
          onPointerDown={handleWavePointerDown}
          onPointerMove={handleWavePointerMove}
          onPointerUp={stopPointerBubble}
          onPointerCancel={stopPointerBubble}
        >
          {peaks.map((peak, i) => (
            <span
              key={i}
              className={styles.bar}
              style={{
                height: `${Math.max(12, peak * 100)}%`,
                opacity: i / peaks.length <= progress ? 1 : 0.35,
              }}
            />
          ))}
        </div>
      </div>

      <div className={styles.foot} style={{ paddingRight: `var(--meta-w, ${own ? 68 : 46}px)` }}>
        <span className={styles.duration}>{formatTime(progress > 0 ? progress * durationMs : durationMs)}</span>
        <span className={`${styles.dot} ${unheard ? styles.dotUnheard : ''}`} aria-hidden="true" />
        <button
          type="button"
          className={styles.speedBtn}
          onClick={cycleSpeed}
          onPointerDown={stopPointerBubble}
          onPointerUp={stopPointerBubble}
          onPointerCancel={stopPointerBubble}
        >
          {SPEED_STEPS[speedIndex]}×
        </button>
      </div>

      <MessageMeta createdAt={createdAt} own={own} edited={edited} status={status} read={read} />
    </>
  );
}
