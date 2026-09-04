import type { LinkPreviewsResponse } from '@messenger/shared';

import { apiRequest } from './client';

export function getLinkPreviewsRequest(urls: string[]): Promise<LinkPreviewsResponse> {
  return apiRequest<LinkPreviewsResponse>('/api/links/preview', { method: 'POST', body: { urls } });
}
