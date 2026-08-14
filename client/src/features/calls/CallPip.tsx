import { useParticipantVideo } from '../../calls/useParticipantVideo';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useChatStore } from '../../stores/chatStore';
import { PipWindow } from './PipWindow';

interface CallPipProps {
  onExpand: () => void;
}

export function CallPip({ onExpand }: CallPipProps) {
  const myId = useAuthStore((s) => s.user?.id) ?? '';
  const call = useCallStore((s) => s.call);
  const participants = useCallStore((s) => s.participants);
  const myCameraEnabled = useCallStore((s) => s.cameraEnabled);
  const flipCamera = useCallStore((s) => s.flipCamera);
  const chats = useChatStore((s) => s.chats);

  const isGroup = chats.find((chat) => chat.id === call?.chatId)?.type === 'GROUP';
  const peerId = call?.participants.find((participant) => participant.user.id !== myId)?.user.id ?? '';
  const peerCameraEnabled = participants.find((participant) => participant.userId === peerId)?.cameraEnabled ?? false;
  const showsPeer = peerCameraEnabled;
  const hasVideo = !isGroup && (peerCameraEnabled || myCameraEnabled);
  const videoRef = useParticipantVideo(showsPeer ? peerId : myId, hasVideo);

  if (!hasVideo) return null;

  return (
    <PipWindow
      videoRef={videoRef}
      corner="bottom-right"
      label={showsPeer ? 'Видео собеседника, нажмите чтобы развернуть звонок' : 'Своё видео, нажмите чтобы переключить камеру'}
      showFlipHint={!showsPeer}
      onTap={showsPeer ? onExpand : () => void flipCamera()}
    />
  );
}
