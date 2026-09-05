const SCROLLABLE = /(auto|scroll|overlay)/;

export function scrollParentOf(node: Element | null): Element | null {
  for (let el = node?.parentElement ?? null; el; el = el.parentElement) {
    if (el === document.body || el === document.documentElement) return null;
    const style = getComputedStyle(el);
    if (SCROLLABLE.test(style.overflowY) || SCROLLABLE.test(style.overflowX)) return el;
  }
  return null;
}
