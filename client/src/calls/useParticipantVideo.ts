import { useEffect, useRef } from 'react';

import { useCallStore } from '../stores/callStore';
import type { CallVideoSource } from './types';

export function useParticipantVideo(userId: string, active: boolean, source: CallVideoSource = 'camera') {
  const attachParticipantVideo = useCallStore((s) => s.attachParticipantVideo);
  const detachParticipantVideo = useCallStore((s) => s.detachParticipantVideo);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!active || !userId) return undefined;
    const element = videoRef.current;
    if (!element) return undefined;
    attachParticipantVideo(userId, element, source);
    return () => detachParticipantVideo(userId, element, source);
  }, [active, userId, source, attachParticipantVideo, detachParticipantVideo]);

  return videoRef;
}
