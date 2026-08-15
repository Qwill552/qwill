import type { AvatarColor, CallDto } from '@messenger/shared';

import type { CallParticipantState } from '../../calls/types';

export interface NamedCallParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor?: AvatarColor;
  micEnabled: boolean;
  isSpeaking: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  mirrored: boolean;
}

export function withDirectory(participants: CallParticipantState[], call: CallDto | null): NamedCallParticipant[] {
  const directory = new Map(call?.participants.map((p) => [p.user.id, p.user] as const));
  return participants.map((p) => {
    const member = directory.get(p.userId);
    return {
      userId: p.userId,
      displayName: member?.displayName ?? p.displayName,
      avatarUrl: member?.avatarUrl ?? p.avatarUrl,
      avatarColor: member?.avatarColor,
      micEnabled: p.micEnabled,
      isSpeaking: p.isSpeaking,
      cameraEnabled: p.cameraEnabled,
      screenShareEnabled: p.screenShareEnabled,
      mirrored: p.mirrored,
    };
  });
}
