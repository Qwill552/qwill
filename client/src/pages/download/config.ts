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

export const DEMO_CLOCK = {
  maxFrameMs: 50,
} as const;

export const DEMO_RETURN = {
  idleMs: 900,
  discreteIdleMs: 1600,
  inertiaTauMs: 320,
  springStiffness: 282,
  springDamping: 34,
  springStepMs: 4,
  settleOffset: 0.4,
  settleVelocity: 0.03,
} as const;

export const DEMO_GESTURE = {
  velocityWindowMs: 90,
  maxVelocity: 3.2,
  rubberFactor: 0.55,
  tapSlopPx: 9,
  tapMaxMs: 500,
} as const;

export const DEMO_REDUCED_FRAME_MS = 7200;

export const DEMO_HINT_VISIBLE_MS = 2000;

export const DEMO_GLOW_SIZE = 280;
