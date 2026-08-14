import { useEffect, useRef } from 'react';

import { useCallStore } from '../stores/callStore';

export function useParticipantVideo(userId: string, active: boolean) {
  const attachParticipantVideo = useCallStore((s) => s.attachParticipantVideo);
  const detachParticipantVideo = useCallStore((s) => s.detachParticipantVideo);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!active || !userId) return undefined;
    const element = videoRef.current;
    if (!element) return undefined;
    attachParticipantVideo(userId, element);
    return () => detachParticipantVideo(userId, element);
  }, [active, userId, attachParticipantVideo, detachParticipantVideo]);

  return videoRef;
}
