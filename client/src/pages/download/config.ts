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

export const DEMO_REDUCED_FRAME_MS = 18000;

export const DEMO_HINT_VISIBLE_MS = 2000;

export const DEMO_GLOW_SIZE = 280;

export const SCENARIO_SWITCH = {
  buttonSize: 44,
  gap: 16,
} as const;

export const LAPTOP_LOGICAL = {
  width: 1280,
  height: 800,
} as const;

export const LAPTOP_BEZEL = {
  metal: 6,
  black: 14,
} as const;

const LAPTOP_FRAME = LAPTOP_BEZEL.metal + LAPTOP_BEZEL.black;

export const LAPTOP_LID = {
  width: LAPTOP_LOGICAL.width + LAPTOP_FRAME * 2,
  height: LAPTOP_LOGICAL.height + LAPTOP_FRAME * 2,
} as const;

export const LAPTOP_RADIUS_SCREEN = 28;
export const LAPTOP_RADIUS_BEZEL = LAPTOP_RADIUS_SCREEN + LAPTOP_BEZEL.black;
export const LAPTOP_RADIUS_LID = LAPTOP_RADIUS_BEZEL + LAPTOP_BEZEL.metal;

export const LAPTOP_EDGE_WIDTH = 1.5;

const LAPTOP_TILT_DEG = 76;
const LAPTOP_PERSPECTIVE = 11000;
const LAPTOP_BASE_DEPTH = 900;

const laptopTiltRad = (LAPTOP_TILT_DEG * Math.PI) / 180;
const laptopFrontScale =
  LAPTOP_PERSPECTIVE / (LAPTOP_PERSPECTIVE - LAPTOP_BASE_DEPTH * Math.sin(laptopTiltRad));

export const LAPTOP_BASE = {
  width: LAPTOP_LID.width,
  depth: LAPTOP_BASE_DEPTH,
  tiltDeg: LAPTOP_TILT_DEG,
  perspective: LAPTOP_PERSPECTIVE,
  radius: 14,
  visibleDepth: Math.round(LAPTOP_BASE_DEPTH * Math.cos(laptopTiltRad) * laptopFrontScale),
  frontWidth: Math.round(LAPTOP_LID.width * laptopFrontScale),
  frontHeight: 24,
  frontRadius: 12,
} as const;

export const LAPTOP_FINGER_NOTCH = {
  width: 190,
  height: 13,
} as const;

export const LAPTOP_KEYS = {
  inset: 133,
  top: 70,
  height: 400,
  radius: 18,
  padding: 14,
  pitchX: 68.4,
  pitchY: 62,
  gap: 9,
  feather: 2,
} as const;

export const LAPTOP_TRACKPAD = {
  width: 520,
  height: 330,
  top: 510,
  radius: 14,
} as const;

export const LAPTOP_BODY = {
  width: LAPTOP_BASE.frontWidth,
  height: LAPTOP_LID.height + LAPTOP_BASE.visibleDepth + LAPTOP_BASE.frontHeight,
} as const;

export const LAPTOP_SHADOW = {
  width: Math.round(LAPTOP_BASE.frontWidth * 0.88),
  height: 56,
} as const;

export const LAPTOP_SCREEN_FONT_SIZE = 16;

export const LAPTOP_SCALE = {
  max: 1,
  min: 0.16,
  heightRatio: 0.86,
} as const;
