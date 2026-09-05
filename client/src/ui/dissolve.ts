const SVG_NS = 'http://www.w3.org/2000/svg';

const FILTER_PAD = 64;
const MAX_PAD_PERCENT = 200;
const DISPLACE_MAX = 130;
const DISPLACE_CURVE = 1.9;
const DRIFT_Y = -12;
const FADE_START = 0.3;
const FADE_CURVE = 1.1;
const INSTANT_MS = 24;

let host: SVGSVGElement | null = null;
let counter = 0;

function filterHost(): SVGSVGElement {
  if (host?.isConnected) return host;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.overflow = 'hidden';
  svg.style.pointerEvents = 'none';
  document.body.append(svg);
  host = svg;
  return svg;
}

function node(tag: string, attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function buildFilter(id: string, seed: number, padX: number, padY: number): SVGElement {
  const filter = node('filter', {
    id,
    x: `${-padX}%`,
    y: `${-padY}%`,
    width: `${100 + padX * 2}%`,
    height: `${100 + padY * 2}%`,
    'color-interpolation-filters': 'sRGB',
  });

  const coarse = node('feTurbulence', {
    type: 'fractalNoise',
    baseFrequency: '0.012',
    numOctaves: '1',
    seed: String(seed),
    result: 'coarse',
  });

  const contrast = node('feComponentTransfer', { in: 'coarse', result: 'coarseHard' });
  contrast.append(
    node('feFuncR', { type: 'linear', slope: '3', intercept: '-1' }),
    node('feFuncG', { type: 'linear', slope: '3', intercept: '-1' }),
  );

  const fine = node('feTurbulence', {
    type: 'fractalNoise',
    baseFrequency: '0.85',
    numOctaves: '1',
    seed: String(seed),
    result: 'fine',
  });

  const merge = node('feMerge', { result: 'grain' });
  merge.append(node('feMergeNode', { in: 'coarseHard' }), node('feMergeNode', { in: 'fine' }));

  const map = node('feDisplacementMap', {
    in: 'SourceGraphic',
    in2: 'grain',
    scale: '0',
    xChannelSelector: 'R',
    yChannelSelector: 'G',
  });

  filter.append(coarse, contrast, fine, merge, map);
  return filter;
}

export interface DissolveOptions {
  durationMs: number;
  onDone: () => void;
}

export function startDissolve(element: HTMLElement, { durationMs, onDone }: DissolveOptions): () => void {
  function clearInlineMotion(): void {
    element.style.filter = '';
    element.style.opacity = '';
    element.style.transform = '';
    element.style.willChange = '';
  }

  if (durationMs <= INSTANT_MS) {
    element.style.opacity = '0';
    onDone();
    return clearInlineMotion;
  }

  // Область фильтра задаётся долей от размера элемента, а рассыпать пыль надо на одно и то
  // же число пикселей во все стороны — иначе у низкой строки её срезало бы по горизонтали.
  const rect = element.getBoundingClientRect();
  const padX = Math.min(MAX_PAD_PERCENT, (FILTER_PAD / Math.max(rect.width, 1)) * 100);
  const padY = Math.min(MAX_PAD_PERCENT, (FILTER_PAD / Math.max(rect.height, 1)) * 100);

  counter += 1;
  const id = `dissolve-${counter}`;
  const filter = buildFilter(id, Math.floor(Math.random() * 1000), padX, padY);
  const map = filter.lastElementChild!;
  filterHost().append(filter);

  element.style.willChange = 'filter, opacity, transform';
  element.style.filter = `url(#${id})`;

  const start = performance.now();
  let frame = 0;
  let finished = false;

  function step(now: number): void {
    const elapsedMs = Math.max(0, now - start);
    const progress = Math.min(1, elapsedMs / durationMs);
    map.setAttribute('scale', (DISPLACE_MAX * Math.pow(progress, DISPLACE_CURVE)).toFixed(1));
    const fade = Math.max(0, (progress - FADE_START) / (1 - FADE_START));
    element.style.opacity = Math.pow(1 - fade, FADE_CURVE).toFixed(3);
    element.style.transform = `translateY(${(DRIFT_Y * progress).toFixed(2)}px)`;

    if (progress < 1) {
      frame = requestAnimationFrame(step);
      return;
    }

    finished = true;
    element.style.opacity = '0';
    element.style.filter = '';
    element.style.willChange = '';
    filter.remove();
    onDone();
  }

  frame = requestAnimationFrame(step);

  return () => {
    cancelAnimationFrame(frame);
    if (!finished) filter.remove();
    clearInlineMotion();
  };
}
