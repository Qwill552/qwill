import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from '@messenger/shared';

import { apiRequest } from './client';

export function registerRequest(input: RegisterInput): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: input,
    skipAuthRetry: true,
  });
}

export function loginRequest(input: LoginInput): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: input,
    skipAuthRetry: true,
  });
}

export function refreshRequest(): Promise<AuthResponse> {
  // body: {} — иначе Express не распарсит JSON без Content-Type и req.body будет undefined,
  // а refreshSchema.safeParse(undefined) не проходит (поле опционально, но объект обязателен).
  return apiRequest<AuthResponse>('/api/auth/refresh', {
    method: 'POST',
    body: {},
    skipAuthRetry: true,
  });
}

export function logoutRequest(): Promise<void> {
  return apiRequest<void>('/api/auth/logout', { method: 'POST', body: {}, skipAuthRetry: true });
}

export function changePasswordRequest(currentPassword: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/api/auth/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export function meRequest(): Promise<PublicUser> {
  return apiRequest<PublicUser>('/api/users/me');
}

export function setAvatarRequest(fileId: string, sha256: string): Promise<PublicUser> {
  return apiRequest<PublicUser>('/api/users/me/avatar', { method: 'POST', body: { fileId, sha256 } });
}
