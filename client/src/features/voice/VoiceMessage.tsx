import type { AttachmentDto } from '@messenger/shared';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { useFileSrc } from '../../api/useFileSrc';
import { Icon } from '../../ui/Icon';
import { MessageMeta } from '../messages/MessageMeta';
import styles from './VoiceMessage.module.css';

const FALLBACK_PEAKS = Array.from({ length: 32 }, (_, i) => 0.3 + 0.25 * Math.abs(Math.sin(i * 0.7)));
const SPEED_STEPS = [1, 1.5, 2] as const;
const PLAYED_STORAGE_KEY = 'qwill:voice-played';

let activeAudio: HTMLAudioElement | null = null;

function loadPlayedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(PLAYED_STORAGE_KEY);
    return raw ? new Set<string>(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markPlayed(attachmentId: string): void {
  const played = loadPlayedSet();
  if (played.has(attachmentId)) return;
  played.add(attachmentId);
  try {
    localStorage.setItem(PLAYED_STORAGE_KEY, JSON.stringify([...played]));
  } catch {
    return;
  }
}

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
  createdAt: string;
  edited: boolean;
  status: 'sending' | 'sent' | 'failed';
  read: boolean;
}

export function VoiceMessage({ attachment, own, createdAt, edited, status, read }: VoiceMessageProps) {
  const src = useFileSrc(attachment.file.id);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(attachment.duration ?? 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [unheard, setUnheard] = useState(() => !own && !loadPlayedSet().has(attachment.id));

  const peaks = attachment.peaks && attachment.peaks.length > 0 ? attachment.peaks : FALLBACK_PEAKS;

  useEffect(() => {
    const audio: HTMLAudioElement = audioRef.current!;
    if (!audio) return;

    function onTimeUpdate(): void {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    }
    function onLoadedMetadata(): void {
      if (Number.isFinite(audio.duration)) setDurationMs(audio.duration * 1000);
    }
    function onEnded(): void {
      setPlaying(false);
      setProgress(0);
    }
    function onPlay(): void {
      if (activeAudio && activeAudio !== audio) activeAudio.pause();
      activeAudio = audio;
      setPlaying(true);
      setUnheard(false);
      markPlayed(attachment.id);
    }
    function onPause(): void {
      setPlaying(false);
    }

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [attachment.id]);

  function togglePlay(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function cycleSpeed(): void {
    const nextIndex = (speedIndex + 1) % SPEED_STEPS.length;
    setSpeedIndex(nextIndex);
    if (audioRef.current) audioRef.current.playbackRate = SPEED_STEPS[nextIndex]!;
  }

  function seekFromClientX(clientX: number): void {
    const audio = audioRef.current;
    const wave = waveRef.current;
    if (!audio || !wave || !audio.duration) return;
    const rect = wave.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
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

      <div className={styles.foot} style={{ paddingRight: own ? 62 : 40 }}>
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
