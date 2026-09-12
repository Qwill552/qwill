import type { ChatMemberSummary } from '@messenger/shared';

import { toAvatarColor } from '../lib/avatarColor.js';
import { fileUrl } from '../lib/fileUrl.js';
import type { User } from '../generated/prisma/client.js';

export type UserSummarySource = Pick<
  User,
  'id' | 'username' | 'displayName' | 'avatarFileId' | 'avatarColor' | 'lastSeenAt' | 'isService'
>;

export function toMemberSummary(user: UserSummarySource): ChatMemberSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: fileUrl(user.avatarFileId),
    avatarColor: toAvatarColor(user.avatarColor),
    lastSeenAt: user.lastSeenAt.toISOString(),
    isService: user.isService,
  };
}
