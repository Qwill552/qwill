import type {
  PublicUser,
  UpdateProfileInput,
  UpdateSettingsInput,
  UserProfileDto,
  UserSettingsDTO,
} from '@messenger/shared';

import { apiRequest } from './client';

export function updateProfileRequest(input: UpdateProfileInput): Promise<PublicUser> {
  return apiRequest<PublicUser>('/api/users/me', { method: 'PATCH', body: input });
}

export function getUserProfileRequest(userId: string): Promise<UserProfileDto> {
  return apiRequest<UserProfileDto>(`/api/users/${userId}/profile`);
}

export function getSettingsRequest(): Promise<UserSettingsDTO> {
  return apiRequest<UserSettingsDTO>('/api/users/me/settings');
}

export function updateSettingsRequest(input: UpdateSettingsInput): Promise<UserSettingsDTO> {
  return apiRequest<UserSettingsDTO>('/api/users/me/settings', { method: 'PATCH', body: input });
}
