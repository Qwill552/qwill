import { MESSAGE_MAX_LENGTH } from '@messenger/shared';

export const LONG_TEXT_SEARCH_BACK = 300;
const SEPARATORS = ['\n\n', '\n', '. ', ' '];

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function boundary(text: string, limit: number): number {
  const from = Math.max(0, limit - LONG_TEXT_SEARCH_BACK);
  for (const separator of SEPARATORS) {
    const found = text.lastIndexOf(separator, limit - separator.length);
    if (found >= from && found > 0) return found + separator.length;
  }
  if (isHighSurrogate(text.charCodeAt(limit - 1)) && isLowSurrogate(text.charCodeAt(limit))) return limit - 1;
  return limit;
}

export function splitLongText(text: string, limit = MESSAGE_MAX_LENGTH): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const cut = boundary(rest, limit);
    const part = rest.slice(0, cut).trim();
    if (part) parts.push(part);
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
