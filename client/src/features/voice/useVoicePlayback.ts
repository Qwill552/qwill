import type { AttachmentDto } from '@messenger/shared';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { useFileSrc } from '../../api/useFileSrc';

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

export interface VoicePlayback {
  src: string | undefined;
  audioRef: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  progress: number;
  durationMs: number;
  unheard: boolean;
  togglePlay: () => void;
  seekTo: (ratio: number) => void;
}

export function useVoicePlayback(attachment: AttachmentDto, own: boolean): VoicePlayback {
  const src = useFileSrc(attachment.file.id, 'full');
  const audioRef = useRef<HTMLAudioElement>(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(attachment.duration ?? 0);
  const [unheard, setUnheard] = useState(() => !own && !loadPlayedSet().has(attachment.id));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onTimeUpdate(): void {
      if (audio!.duration) setProgress(audio!.currentTime / audio!.duration);
    }
    function onLoadedMetadata(): void {
      if (Number.isFinite(audio!.duration)) setDurationMs(audio!.duration * 1000);
    }
    function onEnded(): void {
      setPlaying(false);
      setProgress(0);
    }
    function onPlay(): void {
      if (activeAudio && activeAudio !== audio) activeAudio.pause();
      activeAudio = audio!;
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

  function seekTo(ratio: number): void {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }

  return { src, audioRef, playing, progress, durationMs, unheard, togglePlay, seekTo };
}
