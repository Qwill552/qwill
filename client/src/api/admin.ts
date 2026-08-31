import type {
  AdminLogPageDto,
  AdminLogQuery,
  AdminPiiDto,
  AdminReportDto,
  AdminSettingsDto,
  AdminUserCardDto,
  CreateReportInput,
  ReportGroupDto,
  ReportGroupView,
} from '@messenger/shared';

import { apiRequest } from './client';

export function findAdminUserByUsernameRequest(username: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/by-username/${encodeURIComponent(username)}`);
}

export function getAdminUserRequest(userId: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}`);
}

export function revealAdminUserPiiRequest(userId: string): Promise<AdminPiiDto> {
  return apiRequest<AdminPiiDto>(`/api/admin/users/${userId}/pii`);
}

export function setAdminUserDisplayNameRequest(userId: string, displayName: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/profile`, {
    method: 'PATCH',
    body: { displayName },
  });
}

export function clearAdminUserAvatarRequest(userId: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/avatar`, { method: 'DELETE' });
}

export function clearAdminUserCardRequest(userId: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/card/content`, { method: 'DELETE' });
}

export function clearAdminUserBioRequest(userId: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/bio`, { method: 'DELETE' });
}

export function revokeAdminUserSessionsRequest(userId: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/sessions/revoke`, { method: 'POST' });
}

export function muteUserSupportRequest(userId: string, until: string | null): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/support-mute`, {
    method: 'PATCH',
    body: { until },
  });
}

export function banUserRequest(userId: string, reason: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/ban`, {
    method: 'POST',
    body: { reason },
  });
}

export function unbanUserRequest(userId: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/ban`, { method: 'DELETE' });
}

export function setUserCardRequest(userId: string, disabled: boolean): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/card`, {
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

export function listReportGroupsRequest(view: ReportGroupView): Promise<ReportGroupDto[]> {
  return apiRequest<ReportGroupDto[]>(`/api/admin/reports?view=${view}`);
}

export function markReportWorkingRequest(reportId: string): Promise<void> {
  return apiRequest<void>(`/api/admin/reports/${reportId}`, { method: 'PATCH', body: { status: 'working' } });
}

export function closeReportRequest(reportId: string, resolution: string): Promise<void> {
  return apiRequest<void>(`/api/admin/reports/${reportId}/close`, { method: 'PATCH', body: { resolution } });
}

export function createReportRequest(input: CreateReportInput): Promise<AdminReportDto> {
  return apiRequest<AdminReportDto>('/api/reports', { method: 'POST', body: input });
}

function logQueryString(query: AdminLogQuery): string {
  const params = new URLSearchParams();
  if (query.admin) params.set('admin', query.admin);
  if (query.action) params.set('action', query.action);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.cursor) params.set('cursor', query.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listAdminLogRequest(query: AdminLogQuery): Promise<AdminLogPageDto> {
  return apiRequest<AdminLogPageDto>(`/api/admin/log${logQueryString(query)}`);
}
