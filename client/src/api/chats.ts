import type {
  ChatAttachmentCategory,
  ChatAttachmentCounts,
  ChatAttachmentsPage,
  ChatDto,
  ChatListResponse,
  ChatUpdatedEvent,
  CreateGroupInput,
  CreatePrivateChatInput,
  GroupMemberDTO,
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
  before?: number,
): Promise<ChatAttachmentsPage> {
  const params = new URLSearchParams({ category });
  if (before !== undefined) params.set('before', String(before));
  return apiRequest<ChatAttachmentsPage>(`/api/chats/${chatId}/attachments?${params.toString()}`);
}

export function getChatAttachmentCountsRequest(chatId: string): Promise<ChatAttachmentCounts> {
  return apiRequest<ChatAttachmentCounts>(`/api/chats/${chatId}/attachments/counts`);
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
