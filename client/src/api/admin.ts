import type {
  AdminReportDto,
  AdminSettingsDto,
  AdminUserDto,
  CreateReportInput,
  ReportStatus,
} from '@messenger/shared';

import { apiRequest } from './client';

export function findAdminUserRequest(username: string): Promise<AdminUserDto> {
  return apiRequest<AdminUserDto>(`/api/admin/users?username=${encodeURIComponent(username)}`);
}

export function banUserRequest(userId: string, reason: string): Promise<AdminUserDto> {
  return apiRequest<AdminUserDto>(`/api/admin/users/${userId}/ban`, {
    method: 'POST',
    body: { reason },
  });
}

export function unbanUserRequest(userId: string): Promise<AdminUserDto> {
  return apiRequest<AdminUserDto>(`/api/admin/users/${userId}/ban`, { method: 'DELETE' });
}

export function setUserCardRequest(userId: string, disabled: boolean): Promise<AdminUserDto> {
  return apiRequest<AdminUserDto>(`/api/admin/users/${userId}/card`, {
    method: 'PATCH',
    body: { disabled },
  });
}

export function getAdminSettingsRequest(): Promise<AdminSettingsDto> {
  return apiRequest<AdminSettingsDto>('/api/admin/settings');
}

export function setProfileCardsRequest(enabled: boolean): Promise<AdminSettingsDto> {
  return apiRequest<AdminSettingsDto>('/api/admin/settings/profile-cards', {
    method: 'PATCH',
    body: { enabled },
  });
}

export function listReportsRequest(status?: ReportStatus): Promise<AdminReportDto[]> {
  return apiRequest<AdminReportDto[]>(`/api/admin/reports${status ? `?status=${status}` : ''}`);
}

export function createReportRequest(input: CreateReportInput): Promise<AdminReportDto> {
  return apiRequest<AdminReportDto>('/api/reports', { method: 'POST', body: input });
}
