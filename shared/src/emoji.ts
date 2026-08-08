import emojiRegexFactory from 'emoji-regex';

export interface EmojiMatch {
  value: string;
  index: number;
}

export function matchEmojis(text: string): EmojiMatch[] {
  const regex = emojiRegexFactory();
  const matches: EmojiMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ value: match[0], index: match.index });
  }
  return matches;
}

const SKIN_TONE_MODIFIER = /[\u{1F3FB}-\u{1F3FF}]/u;

export function isSingleEmoji(value: string): boolean {
  if (!value || SKIN_TONE_MODIFIER.test(value)) return false;
  const matches = matchEmojis(value);
  return matches.length === 1 && matches[0]?.value === value;
}
