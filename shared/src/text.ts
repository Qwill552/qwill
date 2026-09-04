export interface TextSpan {
  kind: 'text' | 'link';
  value: string;
  href: string | null;
}

const URL_PATTERN = /https?:\/\/\S+/gu;
const TRAILING_PUNCTUATION = new Set(['.', ',', '!', '?', ';', '»']);

function countChar(value: string, char: string): number {
  let count = 0;
  for (const c of value) if (c === char) count += 1;
  return count;
}

function trimTrailingPunctuation(url: string): string {
  let end = url.length;

  while (end > 0) {
    const char = url.charAt(end - 1);

    if (char === ')') {
      const slice = url.slice(0, end);
      if (countChar(slice, ')') <= countChar(slice, '(')) break;
      end -= 1;
      continue;
    }

    if (char === ']') {
      const slice = url.slice(0, end);
      if (countChar(slice, ']') <= countChar(slice, '[')) break;
      end -= 1;
      continue;
    }

    if (TRAILING_PUNCTUATION.has(char)) {
      end -= 1;
      continue;
    }

    break;
  }

  return url.slice(0, end);
}

function hostOf(url: string): string {
  const afterScheme = url.slice(url.indexOf('://') + 3);
  const stop = afterScheme.search(/[/?#]/);
  return stop === -1 ? afterScheme : afterScheme.slice(0, stop);
}

export function splitTextWithLinks(content: string): TextSpan[] {
  if (!content) return [{ kind: 'text', value: content ?? '', href: null }];

  const spans: TextSpan[] = [];
  let cursor = 0;
  URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_PATTERN.exec(content)) !== null) {
    const raw = match[0];
    const trimmed = trimTrailingPunctuation(raw);

    if (!trimmed || !hostOf(trimmed)) continue;

    const start = match.index;
    if (start > cursor) spans.push({ kind: 'text', value: content.slice(cursor, start), href: null });
    spans.push({ kind: 'link', value: trimmed, href: trimmed });
    cursor = start + trimmed.length;
  }

  if (cursor < content.length) spans.push({ kind: 'text', value: content.slice(cursor), href: null });
  if (spans.length === 0) spans.push({ kind: 'text', value: content, href: null });

  return spans;
}

export function extractLinks(content: string): string[] {
  return splitTextWithLinks(content)
    .filter((span): span is TextSpan & { kind: 'link' } => span.kind === 'link')
    .map((span) => span.href as string);
}
