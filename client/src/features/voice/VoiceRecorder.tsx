import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

import { haptic } from '../../ui/haptic';
import { Icon } from '../../ui/Icon';
import { computePeaksFromBlob } from './waveform';
import styles from './VoiceRecorder.module.css';

const CANCEL_DRAG_PX = 96;
const LOCK_DRAG_PX = 64;
const VOLUME_SMOOTHING = 0.35;

const RECORD_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
};

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return RECORD_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type Phase = 'requesting' | 'holding' | 'locked' | 'error';

export interface VoiceRecorderHandle {
  onPointerMove: (event: ReactPointerEvent | PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}

interface VoiceRecorderProps {
  originX: number;
  originY: number;
  micButtonRef: RefObject<HTMLButtonElement | null>;
  onPhaseChange: (phase: 'holding' | 'locked') => void;
  onCancel: () => void;
  onSend: (file: File, durationMs: number, peaks: number[]) => void;
}

export const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(function VoiceRecorder(
  { originX, originY, micButtonRef, onPhaseChange, onCancel, onSend },
  ref,
) {
  const [phase, setPhase] = useState<Phase>('requesting');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeFrameRef = useRef<number>(0);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const outcomeRef = useRef<'send' | 'cancel' | null>(null);
  const pendingReleaseRef = useRef<'send' | 'cancel' | null>(null);
  const lockedRef = useRef(false);
  const mimeTypeRef = useRef('');
  const rootRef = useRef<HTMLDivElement>(null);

  function stopVolumeLoop(): void {
    cancelAnimationFrame(volumeFrameRef.current);
    micButtonRef.current?.style.setProperty('--mic-level', '0');
  }

  function pollVolume(): void {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (const value of data) {
      const centered = (value - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    const level = Math.min(1, rms * 4);
    const previous = Number(micButtonRef.current?.style.getPropertyValue('--mic-level')) || 0;
    const smoothed = previous + (level - previous) * VOLUME_SMOOTHING;
    micButtonRef.current?.style.setProperty('--mic-level', smoothed.toFixed(3));
    volumeFrameRef.current = requestAnimationFrame(pollVolume);
  }

  function finishRecording(outcome: 'send' | 'cancel'): void {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanupMedia();
      onCancel();
      return;
    }
    outcomeRef.current = outcome;
    recorder.stop();
  }

  function cleanupMedia(): void {
    clearInterval(timerRef.current);
    stopVolumeLoop();
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    void audioContextRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;

    async function start(): Promise<void> {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setPhase('error');
        setError('Запись голосовых недоступна в этом браузере');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;

        const AudioContextCtor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const mimeType = pickMimeType();
        mimeTypeRef.current = mimeType;
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          const durationMs = performance.now() - startedAtRef.current;
          const outcome = outcomeRef.current ?? pendingReleaseRef.current ?? 'cancel';
          const baseMimeType = mimeTypeRef.current.split(';')[0] || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: baseMimeType });
          cleanupMedia();

          if (outcome === 'cancel' || durationMs < 400) {
            onCancel();
            return;
          }

          computePeaksFromBlob(blob)
            .catch(() => [] as number[])
            .then((peaks) => {
              const extension = EXTENSION_BY_MIME[baseMimeType] ?? 'webm';
              const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type });
              onSend(file, Math.round(durationMs), peaks);
            });
        };

        startedAtRef.current = performance.now();
        recorder.start();
        setPhase('holding');
        onPhaseChange('holding');
        volumeFrameRef.current = requestAnimationFrame(pollVolume);
        timerRef.current = setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 200);

        if (pendingReleaseRef.current) finishRecording(pendingReleaseRef.current);
      } catch {
        if (cancelled) return;
        setPhase('error');
        setError('Доступ к микрофону запрещён — разрешите его в настройках браузера');
      }
    }

    void start();

    return () => {
      cancelled = true;
      cleanupMedia();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    onPointerMove(event) {
      if (phase !== 'holding' || lockedRef.current) return;
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;

      const cancelProgress = Math.min(1, Math.max(0, -dx) / CANCEL_DRAG_PX);
      rootRef.current?.style.setProperty('--cancel-progress', cancelProgress.toFixed(3));

      if (-dx >= CANCEL_DRAG_PX) {
        haptic();
        finishRecording('cancel');
        return;
      }

      if (-dy >= LOCK_DRAG_PX) {
        haptic();
        lockedRef.current = true;
        setPhase('locked');
        onPhaseChange('locked');
      }
    },
    onPointerUp() {
      if (lockedRef.current) return;
      if (phase === 'requesting') {
        pendingReleaseRef.current = 'send';
        return;
      }
      finishRecording('send');
    },
    onPointerCancel() {
      if (lockedRef.current) return;
      if (phase === 'requesting') {
        pendingReleaseRef.current = 'cancel';
        return;
      }
      finishRecording('cancel');
    },
  }));

  if (phase === 'error') {
    return (
      <div className={styles.recordField}>
        <span className={styles.errorText}>{error}</span>
        <button type="button" className={styles.errorClose} onClick={onCancel} aria-label="Закрыть">
          <Icon name="close" size={18} />
        </button>
      </div>
    );
  }

  if (phase === 'locked') {
    return (
      <div className={styles.recordField}>
        <button
          type="button"
          className={styles.lockedDelete}
          onClick={() => finishRecording('cancel')}
          aria-label="Удалить запись"
        >
          <Icon name="trash" size={20} />
        </button>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.timer}>{formatElapsed(elapsedMs)}</span>
        <button
          type="button"
          className={styles.lockedSend}
          onClick={() => finishRecording('send')}
          aria-label="Отправить голосовое"
        >
          <Icon name="send" size={20} />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={styles.recordField}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.timer}>{formatElapsed(elapsedMs)}</span>
      <span className={styles.lockHint} aria-hidden="true">
        <Icon name="lock" size={14} />
      </span>
      <span className={styles.cancelHint} aria-hidden="true">
        <Icon name="back" size={14} />
        Отмена
      </span>
    </div>
  );
});
