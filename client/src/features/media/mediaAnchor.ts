export interface MediaRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function findMediaRect(attachmentId: string): MediaRect | null {
  const nodes = document.querySelectorAll(`[data-media-id="${CSS.escape(attachmentId)}"]`);
  let fallback: MediaRect | null = null;

  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom > 0 && rect.top < window.innerHeight) return rect;
    fallback = fallback ?? rect;
  }

  return fallback;
}

export function fitRect(ratio: number, width: number, height: number): MediaRect {
  const boxWidth = Math.min(width, height * ratio);
  const boxHeight = boxWidth / ratio;
  return { left: (width - boxWidth) / 2, top: (height - boxHeight) / 2, width: boxWidth, height: boxHeight };
}

export function flipTransform(from: MediaRect, to: MediaRect): string {
  const scale = Math.max(from.width / to.width, from.height / to.height);
  const x = from.left + from.width / 2 - (to.left + to.width / 2);
  const y = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${x}px, ${y}px) scale(${scale})`;
}
