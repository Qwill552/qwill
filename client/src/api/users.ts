import type {
  PublicUser,
  UpdateProfileInput,
  UpdateSettingsInput,
  UserSearchResult,
  UserSettingsDTO,
} from '@messenger/shared';

import { apiRequest } from './client';

export function updateProfileRequest(input: UpdateProfileInput): Promise<PublicUser> {
  return apiRequest<PublicUser>('/api/users/me', { method: 'PATCH', body: input });
}

export function getSettingsRequest(): Promise<UserSettingsDTO> {
  return apiRequest<UserSettingsDTO>('/api/users/me/settings');
}

export function updateSettingsRequest(input: UpdateSettingsInput): Promise<UserSettingsDTO> {
  return apiRequest<UserSettingsDTO>('/api/users/me/settings', { method: 'PATCH', body: input });
}

export function searchUsersRequest(query: string): Promise<{ results: UserSearchResult[] }> {
  return apiRequest<{ results: UserSearchResult[] }>(`/api/users/search?q=${encodeURIComponent(query)}`);
}
