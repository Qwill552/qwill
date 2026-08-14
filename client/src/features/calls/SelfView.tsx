import { useParticipantVideo } from '../../calls/useParticipantVideo';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { PipWindow } from './PipWindow';

export function SelfView() {
  const myId = useAuthStore((s) => s.user?.id) ?? '';
  const flipCamera = useCallStore((s) => s.flipCamera);
  const videoRef = useParticipantVideo(myId, true);

  return (
    <PipWindow
      videoRef={videoRef}
      label="Своё видео, нажмите чтобы переключить камеру"
      showFlipHint
      onTap={() => void flipCamera()}
    />
  );
}
