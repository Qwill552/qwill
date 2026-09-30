import type { GroupMemberDTO } from '@messenger/shared';

const WORD_SEPARATOR = /[^\p{L}\p{N}]+/u;
const CAPTION_NAME_LIMIT = 10;

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е');
}

function matches(member: GroupMemberDTO, needle: string): boolean {
  if (needle.length === 0) return true;
  if (normalize(member.username).startsWith(needle)) return true;
  const name = normalize(member.displayName);
  if (name.startsWith(needle)) return true;
  return name.split(WORD_SEPARATOR).some((word) => word.length > 0 && word.startsWith(needle));
}

export function filterMembers(
  members: readonly GroupMemberDTO[] | undefined,
  query: string,
  recentAuthorIds: readonly string[],
  myId: string | null,
): GroupMemberDTO[] {
  if (!members) return [];
  const needle = normalize(query.trim().replace(/^@/, '').trim());
  const matching = members.filter((member) => member.userId !== myId && matches(member, needle));
  if (matching.length === 0) return matching;

  const byId = new Map(matching.map((member) => [member.userId, member]));
  const taken = new Set<string>();
  const ordered: GroupMemberDTO[] = [];
  for (const id of recentAuthorIds) {
    const member = byId.get(id);
    if (!member || taken.has(id)) continue;
    taken.add(id);
    ordered.push(member);
  }
  for (const member of matching) {
    if (taken.has(member.userId)) continue;
    taken.add(member.userId);
    ordered.push(member);
  }
  return ordered;
}

export function captionName(member: Pick<GroupMemberDTO, 'displayName' | 'username'>): string {
  const first = member.displayName.trim().split(/\s+/)[0] || member.username;
  return first.length > CAPTION_NAME_LIMIT ? first.slice(0, CAPTION_NAME_LIMIT) : first;
}
