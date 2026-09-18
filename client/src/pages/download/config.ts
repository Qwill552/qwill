export const DOWNLOAD_BREAKPOINTS = {
  tablet: 700,
  desktop: 1000,
} as const;

export const PHONE_LOGICAL = {
  width: 448,
  height: 998,
} as const;

export const PHONE_BEZEL = {
  metal: 4,
  black: 12,
} as const;

const PHONE_FRAME = PHONE_BEZEL.metal + PHONE_BEZEL.black;

export const PHONE_BODY = {
  width: PHONE_LOGICAL.width + PHONE_FRAME * 2,
  height: PHONE_LOGICAL.height + PHONE_FRAME * 2,
} as const;

export const PHONE_RADIUS_SCREEN = 56;
export const PHONE_RADIUS_BEZEL = PHONE_RADIUS_SCREEN + PHONE_BEZEL.black;
export const PHONE_RADIUS_BODY = PHONE_RADIUS_BEZEL + PHONE_BEZEL.metal;

export const PHONE_EDGE_WIDTH = 1.5;

export const PHONE_PUNCH_HOLE = {
  size: 26,
  top: 20,
} as const;

export const PHONE_BUTTONS = {
  protrusion: 3,
  radius: 2,
  power: { top: 226, height: 62 },
  volume: { top: 316, height: 112 },
} as const;

export const PHONE_SCREEN_FONT_SIZE = 16;

export const DEMO_SCALE = {
  max: 1,
  min: 0.3,
  heightRatio: 0.78,
} as const;
