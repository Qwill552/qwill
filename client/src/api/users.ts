import type { PublicUser, UpdateProfileInput, UpdateSettingsInput, UserSettingsDTO } from '@messenger/shared';

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
