import { matchEmojis } from '@messenger/shared';

export type ComposerToken = { kind: 'text'; text: string } | { kind: 'emoji'; emoji: string };

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

function nodeCharLength(node: ChildNode): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node instanceof HTMLElement) {
    const emoji = node.getAttribute(COMPOSER_EMOJI_ATTR);
    if (emoji != null) return emoji.length;
  }
  return 0;
}

export function serializeComposerDom(root: HTMLElement): string {
  let text = '';
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
      return;
    }
    if (node instanceof HTMLElement) {
      const emoji = node.getAttribute(COMPOSER_EMOJI_ATTR);
      if (emoji != null) text += emoji;
    }
  });
  return text;
}

export function getComposerCaretOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
    return serializeComposerDom(root).length;
  }

  const range = selection.getRangeAt(0);
  const children = Array.from(root.childNodes);

  if (range.startContainer === root) {
    let offset = 0;
    for (let i = 0; i < range.startOffset && i < children.length; i += 1) offset += nodeCharLength(children[i]!);
    return offset;
  }

  let offset = 0;
  for (const child of children) {
    if (child === range.startContainer) {
      return offset + (child.nodeType === Node.TEXT_NODE ? range.startOffset : 0);
    }
    if (child.contains(range.startContainer)) {
      return offset + nodeCharLength(child);
    }
    offset += nodeCharLength(child);
  }
  return offset;
}

export function setComposerCaretOffset(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let remaining = Math.max(0, offset);

  for (const child of Array.from(root.childNodes)) {
    const length = nodeCharLength(child);
    if (child.nodeType === Node.TEXT_NODE && remaining <= length) {
      range.setStart(child, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    if (child.nodeType !== Node.TEXT_NODE && remaining < length) {
      range.setStartBefore(child);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
  }

  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
