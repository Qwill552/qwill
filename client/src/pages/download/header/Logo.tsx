import { useId } from 'react';

import styles from './PageHeader.module.css';

type Facet = {
  name: string;
  shape: string;
  tip: { x: number; y: number };
  stops: [offset: number, color: string][];
};

const FACETS: Facet[] = [
  {
    name: 'top-right',
    shape: 'M32 32 32 2 C33.58 3.41 38.81 23.59 39.61 24.39Z',
    tip: { x: 32, y: 2 },
    stops: [
      [0.05, '#f8d9e0'],
      [0.15, '#f0e8ef'],
      [0.35, '#f6e5f5'],
      [0.65, '#f5f1f5'],
      [0.95, '#eae8eb'],
    ],
  },
  {
    name: 'right-top',
    shape: 'M32 32 39.61 24.39 C40.41 25.19 60.59 30.42 62 32Z',
    tip: { x: 62, y: 32 },
    stops: [
      [0.05, '#fbdbe3'],
      [0.15, '#efedf3'],
      [0.55, '#a0e7f9'],
      [0.65, '#aee0f7'],
      [0.85, '#dec1ee'],
      [0.95, '#e6b6e5'],
    ],
  },
  {
    name: 'right-bottom',
    shape: 'M32 32 62 32 C60.59 33.58 40.41 38.81 39.61 39.61Z',
    tip: { x: 62, y: 32 },
    stops: [
      [0.05, '#f7c9cd'],
      [0.25, '#dfcdc4'],
      [0.35, '#bed1ce'],
      [0.55, '#57cce1'],
      [0.85, '#a391d3'],
      [0.95, '#a37abf'],
    ],
  },
  {
    name: 'bottom-right',
    shape: 'M32 32 39.61 39.61 C38.81 40.41 33.58 60.59 32 62Z',
    tip: { x: 32, y: 62 },
    stops: [
      [0.05, '#fdcaca'],
      [0.15, '#fecabe'],
      [0.35, '#fdb2aa'],
      [0.65, '#fd94c7'],
      [0.75, '#e88fce'],
      [0.95, '#a580c7'],
    ],
  },
  {
    name: 'bottom-left',
    shape: 'M32 32 32 62 C30.42 60.59 25.19 40.41 24.39 39.61Z',
    tip: { x: 32, y: 62 },
    stops: [
      [0.05, '#ffd2d4'],
      [0.15, '#ffd5da'],
      [0.25, '#fecce0'],
      [0.45, '#feb4dd'],
      [0.65, '#f7aee4'],
      [0.95, '#ada7de'],
    ],
  },
  {
    name: 'left-bottom',
    shape: 'M32 32 24.39 39.61 C23.59 38.81 3.41 33.58 2 32Z',
    tip: { x: 2, y: 32 },
    stops: [
      [0.05, '#ffd0d5'],
      [0.25, '#fac8df'],
      [0.65, '#f6d1e6'],
      [0.85, '#e0c7e0'],
      [0.95, '#cdb6d0'],
    ],
  },
  {
    name: 'left-top',
    shape: 'M32 32 2 32 C3.41 30.42 23.59 25.19 24.39 24.39Z',
    tip: { x: 2, y: 32 },
    stops: [
      [0.05, '#ffdfe0'],
      [0.15, '#fef5f3'],
      [0.25, '#fefdfb'],
      [0.45, '#fefbfb'],
      [0.75, '#feeff9'],
      [0.95, '#eee1f1'],
    ],
  },
  {
    name: 'top-left',
    shape: 'M32 32 24.39 24.39 C25.19 23.59 30.42 3.41 32 2Z',
    tip: { x: 32, y: 2 },
    stops: [
      [0.05, '#fddfe0'],
      [0.15, '#fcf5f4'],
      [0.25, '#fefefd'],
      [0.95, '#fcfcfb'],
    ],
  },
];

const STAR_OUTLINE =
  'M32 2 C33.58 3.41 38.81 23.59 39.61 24.39 C40.41 25.19 60.59 30.42 62 32 ' +
  'C60.59 33.58 40.41 38.81 39.61 39.61 C38.81 40.41 33.58 60.59 32 62 ' +
  'C30.42 60.59 25.19 40.41 24.39 39.61 C23.59 38.81 3.41 33.58 2 32 ' +
  'C3.41 30.42 23.59 25.19 24.39 24.39 C25.19 23.59 30.42 3.41 32 2Z';

const EDGE_BLUR_DEVIATION = 0.7;
const EDGE_DILATION = 1.4;

export function Logo() {
  const instanceId = useId();
  const facetGradientId = (facet: Facet) => `${instanceId}${facet.name}`;
  const edgeBlurId = `${instanceId}edge-blur`;
  const edgeMaskId = `${instanceId}edge-mask`;

  return (
    <svg className={styles.logo} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <filter
          id={edgeBlurId}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation={EDGE_BLUR_DEVIATION} />
        </filter>
        <mask id={edgeMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <path
            d={STAR_OUTLINE}
            fill="#fff"
            stroke="#fff"
            strokeWidth={EDGE_DILATION}
            strokeLinejoin="round"
            filter={`url(#${edgeBlurId})`}
          />
        </mask>
        {FACETS.map((facet) => (
          <linearGradient
            key={facet.name}
            id={facetGradientId(facet)}
            gradientUnits="userSpaceOnUse"
            x1="32"
            y1="32"
            x2={facet.tip.x}
            y2={facet.tip.y}
          >
            {facet.stops.map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
        ))}
      </defs>
      <g mask={`url(#${edgeMaskId})`}>
        {FACETS.map((facet) => (
          <path key={facet.name} d={facet.shape} fill={`url(#${facetGradientId(facet)})`} />
        ))}
      </g>
    </svg>
  );
}
