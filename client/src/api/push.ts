import type { PushSubscribeInput, PushUnsubscribeInput } from '@messenger/shared';

import { apiRequest } from './client';

export function subscribePushRequest(input: PushSubscribeInput): Promise<void> {
  return apiRequest<void>('/api/push/subscribe', { method: 'POST', body: input });
}

export function unsubscribePushRequest(input: PushUnsubscribeInput): Promise<void> {
  return apiRequest<void>('/api/push/subscribe', { method: 'DELETE', body: input });
}
