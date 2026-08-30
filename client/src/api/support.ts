import type { SupportChatResultDto } from '@messenger/shared';

import { apiRequest } from './client';

export function requestSupportChat(): Promise<SupportChatResultDto> {
  return apiRequest<SupportChatResultDto>('/api/support/chat', { method: 'POST' });
}
