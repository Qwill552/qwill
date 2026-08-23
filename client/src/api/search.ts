import type { SearchResultsDto } from '@messenger/shared';

import { apiRequest } from './client';

export function searchRequest(query: string, signal?: AbortSignal): Promise<SearchResultsDto> {
  return apiRequest<SearchResultsDto>(`/api/search?q=${encodeURIComponent(query)}`, { signal });
}
