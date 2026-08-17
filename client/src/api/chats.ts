import type {
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

import { apiRequest } from './client';

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

export function updateGroupRequest(chatId: string, input: UpdateGroupInput): Promise<ChatUpdatedEvent> {
  return apiRequest<ChatUpdatedEvent>(`/api/chats/${chatId}`, { method: 'PATCH', body: input });
}

export function setChatMutedRequest(chatId: string, muted: boolean): Promise<{ muted: boolean }> {
  return apiRequest<{ muted: boolean }>(`/api/chats/${chatId}/mute`, { method: 'PATCH', body: { muted } });
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
