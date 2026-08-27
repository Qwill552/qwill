import type { EmojiEntry } from './emojiIndex';

const NO_MATCH_TIER = 6;
const MIN_REVERSIBLE_LENGTH = 3;
const MIN_SHARED_PREFIX = 3;
const MIN_STEM_LENGTH = 3;
const MIN_STEMMABLE_LENGTH = 4;

const CYRILLIC_WORD = /^[а-яё]+$/i;

const RUSSIAN_CASE_SUFFIXES = [
  'иями', 'ями', 'ами',
  'иях', 'ях', 'ах',
  'ов', 'ев',
  'ам', 'ям',
  'ом', 'ем',
  'ой', 'ей',
  'ому', 'ему',
  'ого', 'его',
  'ыми', 'ими',
  'ая', 'яя',
  'ое', 'ее',
  'ые', 'ие',
  'ый', 'ий',
  'ых', 'их',
  'ым', 'им',
  'ую', 'юю',
  'а', 'я',
  'ы', 'и',
  'е',
  'у', 'ю',
  'ь',
];

const RUSSIAN_SUFFIXES_BY_LENGTH = [...new Set(RUSSIAN_CASE_SUFFIXES)].sort((a, b) => b.length - a.length);

const IRREGULAR_DECLENSIONS: Record<string, string> = {
  любви: 'любовь',
  любовью: 'любовь',
  огня: 'огонь',
  огню: 'огонь',
  огнём: 'огонь',
  огне: 'огонь',
  сна: 'сон',
  сну: 'сон',
  сном: 'сон',
  сне: 'сон',
  дня: 'день',
  дню: 'день',
  днём: 'день',
  дне: 'день',
  льва: 'лев',
  льву: 'лев',
  льве: 'лев',
  львом: 'лев',
};

function stemRussian(word: string): string {
  if (word.length < MIN_STEMMABLE_LENGTH || !CYRILLIC_WORD.test(word)) return word;
  for (const suffix of RUSSIAN_SUFFIXES_BY_LENGTH) {
    if (word.length - suffix.length < MIN_STEM_LENGTH) continue;
    if (word.endsWith(suffix)) return word.slice(0, word.length - suffix.length);
  }
  return word;
}

function stemsMatch(a: string, b: string): boolean {
  const stemA = stemRussian(a);
  const stemB = stemRussian(b);
  if (stemA.length < MIN_STEM_LENGTH || stemB.length < MIN_STEM_LENGTH) return false;
  return stemA === stemB || stemA.startsWith(stemB) || stemB.startsWith(stemA);
}

function sharesLongPrefix(a: string, b: string): boolean {
  const minLen = Math.min(a.length, b.length);
  if (minLen < MIN_SHARED_PREFIX + 1) return false;
  let shared = 0;
  while (shared < minLen && a[shared] === b[shared]) shared++;
  return shared >= Math.max(MIN_SHARED_PREFIX, Math.ceil(minLen * 0.75));
}

function tokenTier(rawToken: string, keywords: string[]): number {
  const token = IRREGULAR_DECLENSIONS[rawToken] ?? rawToken;
  let best = NO_MATCH_TIER;
  for (const keyword of keywords) {
    if (keyword === token) return 1;
    const reversible = keyword.length >= MIN_REVERSIBLE_LENGTH;
    if (best > 2 && (keyword.startsWith(token) || (reversible && token.startsWith(keyword)))) best = 2;
    else if (best > 3 && (keyword.includes(token) || (reversible && token.includes(keyword)))) best = 3;
    else if (best > 4 && stemsMatch(token, keyword)) best = 4;
    else if (best > 5 && sharesLongPrefix(token, keyword)) best = 5;
  }
  return best;
}

export function tokenizeEmojiQuery(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function scoreEmojiEntry(entry: EmojiEntry, tokens: string[]): number | null {
  let worstTier = 0;
  let tierSum = 0;
  for (const token of tokens) {
    const tier = tokenTier(token, entry.k);
    if (tier === NO_MATCH_TIER) return null;
    worstTier = Math.max(worstTier, tier);
    tierSum += tier;
  }
  return worstTier * 100 + tierSum;
}
