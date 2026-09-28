import { MESSAGE_BATCH_LIMIT } from '@messenger/shared';

export const SELECTION_LIMIT = MESSAGE_BATCH_LIMIT;

export function toggleIds(selected: ReadonlySet<number>, ids: readonly number[], limit = SELECTION_LIMIT): Set<number> {
  const next = new Set(selected);
  if (ids.length > 0 && ids.every((id) => next.has(id))) {
    for (const id of ids) next.delete(id);
    return next;
  }
  const missing = ids.filter((id) => !next.has(id));
  if (next.size + missing.length > limit) return next;
  for (const id of missing) next.add(id);
  return next;
}

export function dragSelect(
  base: ReadonlySet<number>,
  range: readonly (readonly number[])[],
  adding: boolean,
  limit = SELECTION_LIMIT,
): Set<number> {
  const next = new Set(base);
  if (!adding) {
    for (const group of range) for (const id of group) next.delete(id);
    return next;
  }
  for (const group of range) {
    const missing = group.filter((id) => !next.has(id));
    if (next.size + missing.length > limit) break;
    for (const id of missing) next.add(id);
  }
  return next;
}

export interface CopyableMessage {
  id: number;
  content: string | null;
  sender: { id: string; displayName: string } | null;
}

export function selectionCopyText(selected: readonly CopyableMessage[]): string {
  const withText = selected.filter((message) => !!message.content).sort((a, b) => a.id - b.id);
  const named = withText.length > 1;
  const parts: string[] = [];
  let previousAuthor: string | null | undefined;
  for (const message of withText) {
    const author = message.sender?.id ?? null;
    const header = named && author !== previousAuthor ? `${message.sender?.displayName ?? ''}:\n` : '';
    parts.push(`${header}${message.content}`);
    previousAuthor = author;
  }
  return parts.join('\n\n');
}
