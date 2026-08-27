import { describe, expect, it } from 'vitest';

import type { EmojiEntry } from './emojiIndex';
import { scoreEmojiEntry, tokenizeEmojiQuery } from './emojiSearch';

function entry(e: string, k: string[]): EmojiEntry {
  return { e, x: 0, y: 0, c: 0, k };
}

function matches(query: string, e: EmojiEntry): boolean {
  return scoreEmojiEntry(e, tokenizeEmojiQuery(query)) !== null;
}

describe('scoreEmojiEntry', () => {
  it('matches an exact keyword', () => {
    expect(matches('огонь', entry('🔥', ['fire', 'огонь', 'пожар']))).toBe(true);
  });

  it('does not match unrelated words', () => {
    expect(matches('арбуз', entry('🔥', ['fire', 'огонь', 'пожар']))).toBe(false);
  });

  it('requires every word of a multi-word query to match some keyword', () => {
    const heartOnFire = entry('❤️‍🔥', [
      'heart_on_fire',
      'горящее сердце',
      'огонь',
      'любовь',
      'страсть',
      'огненное',
    ]);
    expect(matches('огненное сердце', heartOnFire)).toBe(true);
    expect(matches('разбитое сердце', heartOnFire)).toBe(false);
  });

  it('matches regular Russian declensions via stemming', () => {
    const heart = entry('❤️', ['heart', 'сердце', 'любовь']);
    expect(matches('сердца', heart)).toBe(true);
    expect(matches('сердцем', heart)).toBe(true);
    expect(matches('сердцу', heart)).toBe(true);
  });

  it('matches plurals through reversed substring, no stemming needed', () => {
    const cat = entry('🐱', ['cat', 'кот', 'кошка']);
    expect(matches('коты', cat)).toBe(true);
    expect(matches('котов', cat)).toBe(true);
  });

  it('resolves the irregular fleeting-vowel declension of "любовь"', () => {
    const heartEyes = entry('😍', ['heart_eyes', 'обожаю', 'любовь']);
    expect(matches('любви', heartEyes)).toBe(true);
    expect(matches('любовью', heartEyes)).toBe(true);
  });

  it('resolves the irregular fleeting-vowel declension of "огонь"', () => {
    const fire = entry('🔥', ['fire', 'огонь', 'пожар']);
    expect(matches('огня', fire)).toBe(true);
    expect(matches('огню', fire)).toBe(true);
    expect(matches('огнём', fire)).toBe(true);
  });

  it('does not let a short filler keyword match unrelated queries by substring', () => {
    const shape = entry('💠', ['diamond', 'ромб с точкой', 'с', 'точкой']);
    expect(matches('смешно', shape)).toBe(false);
  });

  it('finds related words via a shared long prefix as a last resort', () => {
    const grinning = entry('😀', ['grinning', 'улыбается', 'смех']);
    expect(matches('смешно', grinning)).toBe(true);
  });

  it('ranks tiers so a better match always scores lower (better) than a weaker one', () => {
    const tokens = tokenizeEmojiQuery('fire');
    const exactScore = scoreEmojiEntry(entry('🔥', ['fire']), tokens)!;
    const prefixScore = scoreEmojiEntry(entry('🧯', ['firefly']), tokens)!;
    const substringScore = scoreEmojiEntry(entry('🎆', ['wildfire']), tokens)!;
    expect(exactScore).toBeLessThan(prefixScore);
    expect(prefixScore).toBeLessThan(substringScore);

    const stemTokens = tokenizeEmojiQuery('сердца');
    const stemScore = scoreEmojiEntry(entry('❤️', ['сердце']), stemTokens)!;
    expect(substringScore).toBeLessThan(stemScore);

    const fuzzyTokens = tokenizeEmojiQuery('смешно');
    const fuzzyScore = scoreEmojiEntry(entry('😀', ['смех']), fuzzyTokens)!;
    expect(stemScore).toBeLessThan(fuzzyScore);
  });
});
