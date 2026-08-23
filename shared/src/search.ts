import { z } from 'zod';

import type { ChatType } from './chat.js';
import type { AvatarColor } from './user.js';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Введите хотя бы один символ'),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface ChatSearchResult {
  id: string;
  type: ChatType;
  title: string;
  avatarUrl: string | null;
  avatarColor: AvatarColor | null;
  lastMessagePreview: string | null;
  isService: boolean;
}

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor: AvatarColor;
  lastSeenAt: string;
  isContact: boolean;
}

export interface SearchResultsDto {
  chats: ChatSearchResult[];
  users: UserSearchResult[];
}
