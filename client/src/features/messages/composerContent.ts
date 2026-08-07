import { matchEmojis } from '@messenger/shared';

import type { EmojiIndex } from '../emoji/emojiIndex';

export type ComposerToken = { kind: 'text'; text: string } | { kind: 'emoji'; emoji: string };

export interface ComposerCaretRange {
  start: number;
  end: number;
}

export const COMPOSER_EMOJI_ATTR = 'data-emoji';

export function tokenizeComposerValue(value: string): ComposerToken[] {
  const matches = matchEmojis(value);
  if (matches.length === 0) return value ? [{ kind: 'text', text: value }] : [];

  const tokens: ComposerToken[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.index > cursor) tokens.push({ kind: 'text', text: value.slice(cursor, match.index) });
    tokens.push({ kind: 'emoji', emoji: match.value });
    cursor = match.index + match.value.length;
  }
  if (cursor < value.length) tokens.push({ kind: 'text', text: value.slice(cursor) });
  return tokens;
}

function atomicEmojiOf(node: Node): string | null {
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  return (node as Element).getAttribute(COMPOSER_EMOJI_ATTR);
}

function textLengthOf(node: Node): number {
  return node.nodeValue?.length ?? 0;
}

export function serializeComposerDom(root: HTMLElement): string {
  let text = '';

  function visit(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.nodeValue ?? '';
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const emoji = atomicEmojiOf(child);
      if (emoji != null) {
        text += emoji;
        continue;
      }
      visit(child);
    }
  }

  visit(root);
  return text;
}

function measureOffsetOfPoint(root: HTMLElement, container: Node, containerOffset: number): number | null {
  let total = 0;
  let found = false;

  function visit(node: Node): void {
    const children = Array.from(node.childNodes);
    for (let i = 0; i < children.length; i += 1) {
      if (node === container && i === containerOffset) {
        found = true;
        return;
      }
      const child = children[i]!;

      if (child.nodeType === Node.TEXT_NODE) {
        if (child === container) {
          total += Math.min(Math.max(containerOffset, 0), textLengthOf(child));
          found = true;
          return;
        }
        total += textLengthOf(child);
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const emoji = atomicEmojiOf(child);
      if (emoji != null) {
        if (child === container || child.contains(container)) {
          found = true;
          return;
        }
        total += emoji.length;
        continue;
      }

      visit(child);
      if (found) return;
    }

    if (node === container && containerOffset >= children.length) found = true;
  }

  visit(root);
  return found ? total : null;
}

export function getComposerCaretRange(root: HTMLElement): ComposerCaretRange {
  const selection = window.getSelection();
  const fallback = serializeComposerDom(root).length;
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
    return { start: fallback, end: fallback };
  }

  const range = selection.getRangeAt(0);
  const start = measureOffsetOfPoint(root, range.startContainer, range.startOffset) ?? fallback;
  const end = range.collapsed ? start : (measureOffsetOfPoint(root, range.endContainer, range.endOffset) ?? fallback);
  return { start, end: Math.max(start, end) };
}

export function getComposerCaretOffset(root: HTMLElement): number {
  return getComposerCaretRange(root).start;
}

export function setComposerCaretOffset(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let remaining = Math.max(0, offset);
  let placed = false;

  function visit(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (placed) return;

      if (child.nodeType === Node.TEXT_NODE) {
        const length = textLengthOf(child);
        if (remaining <= length) {
          range.setStart(child, remaining);
          placed = true;
          return;
        }
        remaining -= length;
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const emoji = atomicEmojiOf(child);
      if (emoji != null) {
        if (remaining < emoji.length) {
          range.setStartBefore(child);
          placed = true;
          return;
        }
        remaining -= emoji.length;
        continue;
      }

      visit(child);
    }
  }

  visit(root);

  if (placed) {
    range.collapse(true);
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

export function createComposerEmojiElement(
  emoji: string,
  index: EmojiIndex | null | undefined,
  size: number,
  className: string | undefined,
): HTMLElement {
  const node = document.createElement('span');
  node.setAttribute(COMPOSER_EMOJI_ATTR, emoji);
  node.setAttribute('contenteditable', 'false');
  node.setAttribute('role', 'img');
  if (className) node.className = className;
  node.style.width = `${size}px`;
  node.style.height = `${size}px`;

  const entry = index?.byChar.get(emoji);
  if (!index || !entry) {
    node.setAttribute('aria-label', emoji);
    node.style.fontSize = `${size}px`;
    node.style.lineHeight = '1';
    node.textContent = emoji;
    return node;
  }

  node.setAttribute('aria-label', entry.k[0] ?? emoji);
  node.style.backgroundImage = 'url(/emoji/sheet.webp)';
  node.style.backgroundRepeat = 'no-repeat';
  node.style.backgroundSize = `${index.cols * size}px ${index.rows * size}px`;
  node.style.backgroundPosition = `-${entry.x * size}px -${entry.y * size}px`;
  return node;
}

export function composerDomMatchesTokens(root: HTMLElement, tokens: ComposerToken[]): boolean {
  const children = root.childNodes;
  if (children.length !== tokens.length) return false;

  for (let i = 0; i < tokens.length; i += 1) {
    const node = children[i]!;
    const token = tokens[i]!;
    if (token.kind === 'text') {
      if (node.nodeType !== Node.TEXT_NODE || node.nodeValue !== token.text) return false;
      continue;
    }
    if (atomicEmojiOf(node) !== token.emoji) return false;
  }
  return true;
}

export function renderComposerDom(
  root: HTMLElement,
  tokens: ComposerToken[],
  createEmojiNode: (emoji: string) => HTMLElement,
): void {
  const nodes = tokens.map((token) =>
    token.kind === 'text' ? document.createTextNode(token.text) : createEmojiNode(token.emoji),
  );
  root.replaceChildren(...nodes);
}
