import { matchEmojis } from '@messenger/shared';
import { createElement, type ReactNode } from 'react';

import { Emoji } from './Emoji';

export function parseEmoji(text: string, size = 20): ReactNode[] {
  const matches = matchEmojis(text);
  if (matches.length === 0) return [text];

  const nodes: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, i) => {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(createElement(Emoji, { key: `${match.index}-${i}`, emoji: match.value, size }));
    cursor = match.index + match.value.length;
  });

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

const EMOJI_ONLY_MAX = 3;

export function emojiOnlyContent(text: string): string[] | null {
  const matches = matchEmojis(text);
  if (matches.length === 0 || matches.length > EMOJI_ONLY_MAX) return null;

  let remainder = text;
  for (const match of matches) remainder = remainder.replace(match.value, '');
  if (remainder.trim().length > 0) return null;

  return matches.map((match) => match.value);
}
