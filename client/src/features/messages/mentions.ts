import { findMentions, type ChatType, type MessageDto } from '@messenger/shared';

export const MENTION_QUERY_MAX = 64;

export interface MentionQueryMatch {
  start: number;
  end: number;
  query: string;
}

export function findMentionQuery(text: string, selectionStart: number, selectionEnd: number): MentionQueryMatch | null {
  if (selectionStart !== selectionEnd || selectionStart < 0 || selectionStart > text.length) return null;
  const cursor = selectionStart;
  for (let at = cursor - 1; at >= 0 && cursor - at <= MENTION_QUERY_MAX + 1; at -= 1) {
    const char = text[at];
    if (char === '\n') return null;
    if (char !== '@') continue;
    if (at > 0 && text[at - 1] !== ' ' && text[at - 1] !== '\n') return null;
    const query = text.slice(at + 1, cursor);
    if (query && (/\s/.test(query[0]!) || /\s/.test(query[query.length - 1]!))) return null;
    return { start: at, end: cursor, query };
  }
  return null;
}

export function mentionInsertion(username: string): string {
  return `@${username} `;
}

export function mentionsMe(
  message: Pick<MessageDto, 'sender' | 'deletedAt' | 'content'>,
  chatType: ChatType,
  myId: string | null,
  myUsername: string | null,
  repliedSenderId: string | null,
): boolean {
  if (chatType !== 'GROUP' || !myId) return false;
  if (message.sender?.id === myId || message.deletedAt) return false;
  if (repliedSenderId === myId) return true;
  if (!myUsername) return false;
  const username = myUsername.toLowerCase();
  return findMentions(message.content ?? '').some((mention) => mention.username === username);
}
