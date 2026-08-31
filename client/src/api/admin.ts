import {
  ADMIN_TICKET_HEADER,
  ErrorCode,
  type AdminLogPageDto,
  type AdminLogQuery,
  type AdminPiiDto,
  type AdminReportDto,
  type AdminSettingsDto,
  type AdminTicketDto,
  type AdminUserCardDto,
  type CreateReportInput,
  type ReportGroupDto,
  type ReportGroupView,
} from '@messenger/shared';

import { ApiError, apiRequest } from './client';

let adminTicket: string | null = null;

export function setAdminTicket(ticket: string | null): void {
  adminTicket = ticket;
}

export function adminReauthRequest(password: string): Promise<AdminTicketDto> {
  return apiRequest<AdminTicketDto>('/api/admin/reauth', { method: 'POST', body: { password } });
}

let reauthHandler: (() => Promise<boolean>) | null = null;

export function setAdminReauthHandler(handler: (() => Promise<boolean>) | null): void {
  reauthHandler = handler;
}

function ticketHeaders(): Record<string, string> {
  return adminTicket ? { [ADMIN_TICKET_HEADER]: adminTicket } : {};
}

async function ticketed<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== ErrorCode.ADMIN_TICKET_REQUIRED) throw error;
    adminTicket = null;
    if (!reauthHandler || !(await reauthHandler())) throw error;
    return run();
  }
}

export function findAdminUserByUsernameRequest(username: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/by-username/${encodeURIComponent(username)}`);
}

export function getAdminUserRequest(userId: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}`);
}

export function revealAdminUserPiiRequest(userId: string): Promise<AdminPiiDto> {
  return ticketed(() =>
    apiRequest<AdminPiiDto>(`/api/admin/users/${userId}/pii`, { headers: ticketHeaders() }),
  );
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

export function hideAdminUserCardRequest(userId: string): Promise<AdminUserCardDto> {
  return apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/card/hide`, { method: 'POST' });
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
  return ticketed(() =>
    apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/ban`, {
      method: 'POST',
      body: { reason },
      headers: ticketHeaders(),
    }),
  );
}

export function unbanUserRequest(userId: string): Promise<AdminUserCardDto> {
  return ticketed(() =>
    apiRequest<AdminUserCardDto>(`/api/admin/users/${userId}/ban`, {
      method: 'DELETE',
      headers: ticketHeaders(),
    }),
  );
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
  return ticketed(() =>
    apiRequest<AdminSettingsDto>('/api/admin/settings/profile-cards', {
      method: 'PATCH',
      body: { enabled },
      headers: ticketHeaders(),
    }),
  );
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
