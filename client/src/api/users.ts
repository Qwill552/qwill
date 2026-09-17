import { ErrorCode } from '@messenger/shared';
import type {
  ApiErrorBody,
  BlockStateDto,
  CardFontDto,
  CardImageDto,
  CardImageListDto,
  ChatMemberSummary,
  ProfileCardPreviewDto,
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
async function throwCardError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  throw new ApiError(
    body?.error ?? { code: ErrorCode.INTERNAL, message: 'Не удалось выполнить запрос' },
    res.status,
  );
}

async function cardText(path: string, init: RequestInit = {}): Promise<string> {
  const res = await apiFetch(path, init);
  if (!res.ok) await throwCardError(res);
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

export async function putCardPreviewRequest(html: string): Promise<ProfileCardPreviewDto> {
  const res = await apiFetch('/api/users/me/card/preview', {
    method: 'PUT',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  });
  if (!res.ok) await throwCardError(res);
  return (await res.json()) as ProfileCardPreviewDto;
}

export function deleteOwnCardRequest(): Promise<void> {
  return apiRequest<void>('/api/users/me/card', { method: 'DELETE' });
}

export function listCardImagesRequest(): Promise<CardImageListDto> {
  return apiRequest<CardImageListDto>('/api/users/me/card/images');
}

/** Тело — сами байты картинки, имя едет в query: multipart в этом API не используется нигде,
 *  и заводить его разбор ради одного маршрута значит добавлять поверхность атаки (R-30C). */
export async function uploadCardImageRequest(
  name: string,
  file: File,
  replace: boolean,
): Promise<CardImageDto> {
  const query = `name=${encodeURIComponent(name)}${replace ? '&replace=1' : ''}`;
  const res = await apiFetch(`/api/users/me/card/images?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) await throwCardError(res);
  return (await res.json()) as CardImageDto;
}

export function deleteCardImageRequest(name: string): Promise<void> {
  return apiRequest<void>(`/api/users/me/card/images/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export function listCardFontsRequest(): Promise<CardFontDto[]> {
  return apiRequest<CardFontDto[]>('/api/card-fonts');
}

export function getSettingsRequest(): Promise<UserSettingsDTO> {
  return apiRequest<UserSettingsDTO>('/api/users/me/settings');
}

export function updateSettingsRequest(input: UpdateSettingsInput): Promise<UserSettingsDTO> {
  return apiRequest<UserSettingsDTO>('/api/users/me/settings', { method: 'PATCH', body: input });
}

export function blockUserRequest(userId: string): Promise<BlockStateDto> {
  return apiRequest<BlockStateDto>(`/api/users/${userId}/block`, { method: 'POST' });
}

export function unblockUserRequest(userId: string): Promise<BlockStateDto> {
  return apiRequest<BlockStateDto>(`/api/users/${userId}/block`, { method: 'DELETE' });
}

export function listBlockedRequest(): Promise<ChatMemberSummary[]> {
  return apiRequest<ChatMemberSummary[]>('/api/users/me/blocked');
}
