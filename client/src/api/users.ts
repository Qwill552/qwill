import { ErrorCode } from '@messenger/shared';
import type {
  ApiErrorBody,
  PublicUser,
  UpdateProfileInput,
  UpdateSettingsInput,
  UserProfileDto,
  UserSettingsDTO,
} from '@messenger/shared';

import { ApiError, apiFetch, apiRequest } from './client';

export function updateProfileRequest(input: UpdateProfileInput): Promise<PublicUser> {
  return apiRequest<PublicUser>('/api/users/me', { method: 'PATCH', body: input });
}

export function getUserProfileRequest(userId: string): Promise<UserProfileDto> {
  return apiRequest<UserProfileDto>(`/api/users/${userId}/profile`);
}

/** Визитка ходит текстом, а не JSON: тело — сам HTML, и на домене приложения оно отдаётся
 *  как `text/plain` с `nosniff`, чтобы прямое открытие адреса ничего не исполняло (R-30). */
async function cardText(path: string, init: RequestInit = {}): Promise<string> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      body?.error ?? { code: ErrorCode.INTERNAL, message: 'Не удалось выполнить запрос' },
      res.status,
    );
  }
  return res.text();
}

export function getOwnCardRequest(): Promise<string> {
  return cardText('/api/users/me/card');
}

export function getUserCardRequest(userId: string): Promise<string> {
  return cardText(`/api/users/${userId}/card`);
}

export function putOwnCardRequest(html: string): Promise<string> {
  return cardText('/api/users/me/card', {
    method: 'PUT',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  });
}

export function deleteOwnCardRequest(): Promise<void> {
  return apiRequest<void>('/api/users/me/card', { method: 'DELETE' });
}

export function getSettingsRequest(): Promise<UserSettingsDTO> {
  return apiRequest<UserSettingsDTO>('/api/users/me/settings');
}

export function updateSettingsRequest(input: UpdateSettingsInput): Promise<UserSettingsDTO> {
  return apiRequest<UserSettingsDTO>('/api/users/me/settings', { method: 'PATCH', body: input });
}
