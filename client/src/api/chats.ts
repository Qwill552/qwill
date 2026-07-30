import type {
  ChatDto,
  ChatListResponse,
  CreatePrivateChatInput,
  MessagesPage,
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

export function getMessagesRequest(chatId: string, before?: number): Promise<MessagesPage> {
  const query = before !== undefined ? `?before=${before}` : '';
  return apiRequest<MessagesPage>(`/api/chats/${chatId}/messages${query}`);
}
