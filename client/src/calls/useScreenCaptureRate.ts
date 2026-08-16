import { useEffect, useState } from 'react';
import { Track } from 'livekit-client';
import type { LocalVideoTrack } from 'livekit-client';

import { getActiveRoom } from './transport';

const SAMPLE_MS = 2000;
const SLOW_SHARE_OF_NOMINAL = 0.6;
const MOVING_FPS_FLOOR = 12;
const SAMPLES_BEFORE_HINT = 3;

export interface ScreenCaptureRate {
  fps: number;
  nominalFps: number;
  slow: boolean;
}

const IDLE: ScreenCaptureRate = { fps: 0, nominalFps: 0, slow: false };

function screenTrack(): LocalVideoTrack | undefined {
  return getActiveRoom()?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
}

async function readCaptureFps(track: LocalVideoTrack): Promise<number | null> {
  const report = await track.getRTCStatsReport();
  if (!report) return null;
  let fps: number | null = null;
  report.forEach((value) => {
    const entry = value as { type: string; kind?: string; framesPerSecond?: number };
    if (entry.type === 'media-source' && entry.kind === 'video') fps = Math.round(entry.framesPerSecond ?? 0);
  });
  return fps;
}

export function useScreenCaptureRate(active: boolean): ScreenCaptureRate {
  const [rate, setRate] = useState<ScreenCaptureRate>(IDLE);

  useEffect(() => {
    if (!active) {
      setRate(IDLE);
      return;
    }

    let cancelled = false;
    let watchedTrackId = '';
    let slowSamples = 0;

    const tick = async (): Promise<void> => {
      const track = screenTrack();
      if (!track) return;
      if (track.mediaStreamTrack.id !== watchedTrackId) {
        watchedTrackId = track.mediaStreamTrack.id;
        slowSamples = 0;
      }
      const nominalFps = Math.round(track.mediaStreamTrack.getSettings().frameRate ?? 0);
      const fps = await readCaptureFps(track);
      if (cancelled || fps === null) return;

      const belowNominal = nominalFps > 0 && fps >= MOVING_FPS_FLOOR && fps < nominalFps * SLOW_SHARE_OF_NOMINAL;
      slowSamples = belowNominal ? slowSamples + 1 : 0;
      const next: ScreenCaptureRate = { fps, nominalFps, slow: slowSamples >= SAMPLES_BEFORE_HINT };

      setRate((previous) => {
        if (!next.slow && !previous.slow) return previous;
        if (next.slow === previous.slow && next.fps === previous.fps) return previous;
        return next;
      });
    };

    void tick();
    const timer = setInterval(() => void tick(), SAMPLE_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active]);

  return rate;
}
