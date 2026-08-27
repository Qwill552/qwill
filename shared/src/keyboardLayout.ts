const QWERTY_TO_JCUKEN: Record<string, string> = {
  '`': 'ё',
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю', '/': '.',
  '@': '"', '#': '№', $: ';', '^': ':', '&': '?', '{': 'х', '}': 'ъ', '|': '/',
  ':': 'ж', '"': 'э', '<': 'б', '>': 'ю', '?': '.', '~': 'ё',
};

const JCUKEN_TO_QWERTY: Record<string, string> = {
  ё: '`',
  й: 'q', ц: 'w', у: 'e', к: 'r', е: 't', н: 'y', г: 'u', ш: 'i', щ: 'o', з: 'p', х: '[', ъ: ']',
  ф: 'a', ы: 's', в: 'd', а: 'f', п: 'g', р: 'h', о: 'j', л: 'k', д: 'l', ж: ';', э: "'",
  я: 'z', ч: 'x', с: 'c', м: 'v', и: 'b', т: 'n', ь: 'm', б: ',', ю: '.', '.': '/',
  '"': '@', '№': '#', ';': '$', ':': '^', '?': '&',
};

const LATIN_LETTER = /[a-z]/;
const CYRILLIC_LETTER = /[а-яё]/;

type Alphabet = 'latin' | 'cyrillic' | 'mixed' | 'none';

function detectAlphabet(query: string): Alphabet {
  let hasLatin = false;
  let hasCyrillic = false;
  for (const char of query) {
    if (LATIN_LETTER.test(char)) hasLatin = true;
    else if (CYRILLIC_LETTER.test(char)) hasCyrillic = true;
  }
  if (hasLatin && hasCyrillic) return 'mixed';
  if (hasLatin) return 'latin';
  if (hasCyrillic) return 'cyrillic';
  return 'none';
}

function convert(query: string, map: Record<string, string>): string {
  let result = '';
  for (const char of query) result += map[char] ?? char;
  return result;
}

export function layoutVariants(query: string): string[] {
  const normalized = query.toLowerCase();
  if (normalized.length === 0) return [''];

  const alphabet = detectAlphabet(normalized);
  const variants = [normalized];
  if (alphabet === 'latin' || alphabet === 'none') variants.push(convert(normalized, QWERTY_TO_JCUKEN));
  else if (alphabet === 'cyrillic') variants.push(convert(normalized, JCUKEN_TO_QWERTY));

  return [...new Set(variants)];
}
