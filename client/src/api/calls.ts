import type { CallDto } from '@messenger/shared';

import { apiRequest } from './client';

export function getLiveCallsRequest(): Promise<{ calls: CallDto[] }> {
  return apiRequest<{ calls: CallDto[] }>('/api/calls/live');
}
