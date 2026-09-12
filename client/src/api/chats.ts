import type {
  ChatAttachmentCategory,
  ChatAttachmentCounts,
  ChatAttachmentsPage,
  ChatCalendarFilter,
  ChatCalendarResponse,
  ChatDto,
  ChatLinksPage,
  ChatListResponse,
  ChatSearchResponse,
  ChatUpdatedEvent,
  CreateGroupInput,
  CreatePrivateChatInput,
  GroupMemberDTO,
  MessagesAround,
  MessagesPage,
  MessagesSyncResponse,
  UpdateGroupInput,
  UpdateRoleInput,
} from '@messenger/shared';

import { apiBeacon, apiRequest } from './client';

export function listChatsRequest(): Promise<ChatListResponse> {
  return apiRequest<ChatListResponse>('/api/chats');
}

export function getChatRequest(chatId: string): Promise<ChatDto> {
  return apiRequest<ChatDto>(`/api/chats/${chatId}`);
}

export function createPrivateChatRequest(input: CreatePrivateChatInput): Promise<ChatDto> {
  return apiRequest<ChatDto>('/api/chats/private', { method: 'POST', body: input });
}

export function createGroupRequest(input: CreateGroupInput): Promise<ChatDto> {
  return apiRequest<ChatDto>('/api/chats/group', { method: 'POST', body: input });
}

export function getMessagesRequest(chatId: string, before?: number): Promise<MessagesPage> {
  const query = before !== undefined ? `?before=${before}` : '';
  return apiRequest<MessagesPage>(`/api/chats/${chatId}/messages${query}`);
}

export function getMessagesAfterRequest(chatId: string, after: number): Promise<MessagesPage> {
  return apiRequest<MessagesPage>(`/api/chats/${chatId}/messages?after=${after}`);
}

export function getMessagesAroundRequest(chatId: string, messageId: number): Promise<MessagesAround> {
  return apiRequest<MessagesAround>(`/api/chats/${chatId}/messages/around/${messageId}`);
}

export function syncMessagesRequest(
  chatId: string,
  sinceId: number,
  sinceUpdatedAt: string | null,
): Promise<MessagesSyncResponse> {
  const params = new URLSearchParams({ sinceId: String(sinceId) });
  if (sinceUpdatedAt) params.set('sinceUpdatedAt', sinceUpdatedAt);
  return apiRequest<MessagesSyncResponse>(`/api/chats/${chatId}/sync?${params.toString()}`);
}

export function getChatAttachmentsRequest(
  chatId: string,
  category: ChatAttachmentCategory,
  cursor?: { before?: number; after?: number },
): Promise<ChatAttachmentsPage> {
  const params = new URLSearchParams({ category });
  if (cursor?.before !== undefined) params.set('before', String(cursor.before));
  if (cursor?.after !== undefined) params.set('after', String(cursor.after));
  return apiRequest<ChatAttachmentsPage>(`/api/chats/${chatId}/attachments?${params.toString()}`);
}

export function chatCalendarRequest(
  chatId: string,
  range: { from: string; to: string },
  filter: ChatCalendarFilter,
): Promise<ChatCalendarResponse> {
  const params = new URLSearchParams({
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    from: range.from,
    to: range.to,
    filter,
  });
  return apiRequest<ChatCalendarResponse>(`/api/chats/${chatId}/calendar?${params.toString()}`);
}

export function getChatLinksRequest(chatId: string, before?: number): Promise<ChatLinksPage> {
  const params = new URLSearchParams();
  if (before !== undefined) params.set('before', String(before));
  const query = params.toString();
  return apiRequest<ChatLinksPage>(`/api/chats/${chatId}/links${query ? `?${query}` : ''}`);
}

export function getChatAttachmentCountsRequest(chatId: string): Promise<ChatAttachmentCounts> {
  return apiRequest<ChatAttachmentCounts>(`/api/chats/${chatId}/attachments/counts`);
}

export interface SearchInChatOptions {
  before?: number;
  fromUserId?: string | null;
  signal?: AbortSignal;
}

export function searchInChatRequest(chatId: string, q: string, options: SearchInChatOptions = {}): Promise<ChatSearchResponse> {
  const params = new URLSearchParams({ q });
  if (options.before !== undefined) params.set('before', String(options.before));
  if (options.fromUserId) params.set('fromUserId', options.fromUserId);
  return apiRequest<ChatSearchResponse>(`/api/chats/${chatId}/messages/search?${params.toString()}`, {
    signal: options.signal,
  });
}

export function updateGroupRequest(chatId: string, input: UpdateGroupInput): Promise<ChatUpdatedEvent> {
  return apiRequest<ChatUpdatedEvent>(`/api/chats/${chatId}`, { method: 'PATCH', body: input });
}

export function setChatMutedRequest(chatId: string, muted: boolean): Promise<{ muted: boolean }> {
  return apiRequest<{ muted: boolean }>(`/api/chats/${chatId}/mute`, { method: 'PATCH', body: { muted } });
}

export function deleteChatRequest(chatId: string, forEveryone: boolean): Promise<void> {
  return apiRequest<void>(`/api/chats/${chatId}?forEveryone=${forEveryone}`, { method: 'DELETE' });
}

export function dropEmptyChatRequest(chatId: string): void {
  apiBeacon(`/api/chats/${chatId}/if-empty`, 'DELETE');
}

export function getMembersRequest(chatId: string): Promise<{ members: GroupMemberDTO[] }> {
  return apiRequest<{ members: GroupMemberDTO[] }>(`/api/chats/${chatId}/members`);
}

export function addMemberRequest(chatId: string, username: string): Promise<GroupMemberDTO> {
  return apiRequest<GroupMemberDTO>(`/api/chats/${chatId}/members`, { method: 'POST', body: { username } });
}

export function removeMemberRequest(chatId: string, userId: string): Promise<void> {
  return apiRequest<void>(`/api/chats/${chatId}/members/${userId}`, { method: 'DELETE' });
}

export function updateMemberRoleRequest(chatId: string, userId: string, input: UpdateRoleInput): Promise<GroupMemberDTO> {
  return apiRequest<GroupMemberDTO>(`/api/chats/${chatId}/members/${userId}`, { method: 'PATCH', body: input });
}

export function leaveGroupRequest(chatId: string): Promise<void> {
  return apiRequest<void>(`/api/chats/${chatId}/leave`, { method: 'POST', body: {} });
}

export function transferOwnershipRequest(chatId: string, username: string): Promise<{ members: GroupMemberDTO[] }> {
  return apiRequest<{ members: GroupMemberDTO[] }>(`/api/chats/${chatId}/transfer-ownership`, {
    method: 'POST',
    body: { username },
  });
}
