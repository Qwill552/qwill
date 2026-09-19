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

const LAPTOP_MM = {
  bodyWidth: 312.6,
  bodyDepth: 221.2,
  keyPitchX: 19.05,
  keyPitchY: 18.51,
  keyGap: 1.6,
  keyRadius: 2.6,
  wellPadding: 5.2,
  wellTop: 4,
  wellRadius: 4.4,
  trackpadWidth: 129.5,
  trackpadHeight: 81.5,
  trackpadBottom: 6.6,
  trackpadRadius: 6,
} as const;

const laptopPxPerMm = LAPTOP_LID.width / LAPTOP_MM.bodyWidth;
const laptopRound = (value: number) => Math.round(value * 10) / 10;
const laptopPx = (mm: number) => laptopRound(mm * laptopPxPerMm);

const LAPTOP_TILT_DEG = 76;
const LAPTOP_PERSPECTIVE = 11000;
const LAPTOP_BASE_DEPTH = laptopPx(LAPTOP_MM.bodyDepth);

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

export const LAPTOP_KEY_ROWS = [
  { height: 1, keys: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { height: 1, keys: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5] },
  { height: 1, keys: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { height: 1, keys: [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75] },
  { height: 1, keys: [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25] },
  { height: 1.13, keys: [1, 1, 1, 1.25, 5, 1.25, 1, 1, 'stack', 1] },
] as const satisfies readonly { height: number; keys: readonly (number | 'stack')[] }[];

const LAPTOP_KEY_COLUMNS = 14.5;
const laptopKeyRows = LAPTOP_KEY_ROWS.reduce((total, row) => total + row.height, 0);
const laptopKeyPitchX = laptopPx(LAPTOP_MM.keyPitchX);
const laptopKeyPitchY = laptopPx(LAPTOP_MM.keyPitchY);
const laptopKeyGap = laptopPx(LAPTOP_MM.keyGap);
const laptopWellPadding = laptopPx(LAPTOP_MM.wellPadding);
const laptopKeyFieldWidth = laptopRound(LAPTOP_KEY_COLUMNS * laptopKeyPitchX - laptopKeyGap);
const laptopKeyFieldHeight = laptopRound(laptopKeyRows * laptopKeyPitchY - laptopKeyGap);

export const LAPTOP_KEYS = {
  inset: laptopRound((LAPTOP_BASE.width - laptopKeyFieldWidth - laptopWellPadding * 2) / 2),
  top: laptopPx(LAPTOP_MM.wellTop),
  height: laptopRound(laptopKeyFieldHeight + laptopWellPadding * 2),
  radius: laptopPx(LAPTOP_MM.wellRadius),
  padding: laptopWellPadding,
  pitchX: laptopKeyPitchX,
  pitchY: laptopKeyPitchY,
  gap: laptopKeyGap,
  keyRadius: laptopPx(LAPTOP_MM.keyRadius),
} as const;

export const LAPTOP_TRACKPAD = {
  width: laptopPx(LAPTOP_MM.trackpadWidth),
  height: laptopPx(LAPTOP_MM.trackpadHeight),
  top: LAPTOP_BASE.depth - laptopPx(LAPTOP_MM.trackpadBottom) - laptopPx(LAPTOP_MM.trackpadHeight),
  radius: laptopPx(LAPTOP_MM.trackpadRadius),
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

const LAPTOP_MENU_BORDER = 1;
const LAPTOP_MENU_PAD_X = 10;
const LAPTOP_MENU_REACTION_SIZE = 30;
const LAPTOP_MENU_REACTION_PAD_Y = 8;
const LAPTOP_MENU_ITEM_HEIGHT = 36;
const LAPTOP_MENU_LIST_PAD = 6;
const LAPTOP_MENU_REACTION_COUNT = 8;
const LAPTOP_MENU_ITEM_COUNT = 5;
const LAPTOP_MENU_WIDTH = 280;

const laptopMenuReactionsHeight =
  LAPTOP_MENU_REACTION_PAD_Y * 2 + LAPTOP_MENU_REACTION_SIZE + LAPTOP_MENU_BORDER;

const laptopMenuListHeight =
  LAPTOP_MENU_LIST_PAD * 2 + LAPTOP_MENU_ITEM_COUNT * LAPTOP_MENU_ITEM_HEIGHT;

const laptopMenuReactionSpan =
  LAPTOP_MENU_WIDTH - LAPTOP_MENU_BORDER * 2 - LAPTOP_MENU_PAD_X * 2;

export const LAPTOP_MENU = {
  width: LAPTOP_MENU_WIDTH,
  border: LAPTOP_MENU_BORDER,
  padX: LAPTOP_MENU_PAD_X,
  reactionSize: LAPTOP_MENU_REACTION_SIZE,
  reactionPadY: LAPTOP_MENU_REACTION_PAD_Y,
  reactionCount: LAPTOP_MENU_REACTION_COUNT,
  itemHeight: LAPTOP_MENU_ITEM_HEIGHT,
  itemCount: LAPTOP_MENU_ITEM_COUNT,
  listPad: LAPTOP_MENU_LIST_PAD,
  height: LAPTOP_MENU_BORDER * 2 + laptopMenuReactionsHeight + laptopMenuListHeight,
  reactionPitch:
    (laptopMenuReactionSpan - LAPTOP_MENU_REACTION_COUNT * LAPTOP_MENU_REACTION_SIZE) /
      (LAPTOP_MENU_REACTION_COUNT - 1) +
    LAPTOP_MENU_REACTION_SIZE,
} as const;

export function laptopMenuOrigin(x: number, y: number): { top: number; left: number } {
  return {
    top: y + LAPTOP_MENU.height <= LAPTOP_LOGICAL.height ? y : y - LAPTOP_MENU.height,
    left: x + LAPTOP_MENU.width <= LAPTOP_LOGICAL.width ? x : x - LAPTOP_MENU.width,
  };
}

export const LAPTOP_CURSOR_SIZE = { width: 20, height: 24 } as const;

const LAPTOP_BUBBLE_POINT = { x: 520, y: 682 } as const;

const laptopMenuAnchor = laptopMenuOrigin(LAPTOP_BUBBLE_POINT.x, LAPTOP_BUBBLE_POINT.y);

const LAPTOP_REACTION_INDEX = 4;

export const LAPTOP_CURSOR = {
  listRest: { x: 190, y: 470 },
  chatRow: { x: 150, y: 149 },
  bubble: LAPTOP_BUBBLE_POINT,
  reaction: {
    x:
      laptopMenuAnchor.left +
      LAPTOP_MENU.border +
      LAPTOP_MENU.padX +
      LAPTOP_REACTION_INDEX * LAPTOP_MENU.reactionPitch +
      LAPTOP_MENU.reactionSize / 2,
    y:
      laptopMenuAnchor.top +
      LAPTOP_MENU.border +
      LAPTOP_MENU.reactionPadY +
      LAPTOP_MENU.reactionSize / 2,
  },
  composer: { x: 700, y: 760 },
  send: { x: 1158, y: 760 },
  search: { x: 150, y: 34 },
} as const;

export const LAPTOP_SCENE_MS = {
  listGlide: 1800,
  listSettle: 900,
  rowPress: 320,
  chatOpen: 600,
  toBubble: 1000,
  bubblePress: 320,
  menuOpen: 780,
  menuPick: 1100,
  menuClose: 500,
  reactionArrive: 1200,
  composerPress: 320,
  typing: 2400,
  beforeSend: 700,
  sendPress: 300,
  sent: 600,
  read: 500,
  punchline: 1700,
  album: 2000,
  recording: 3000,
  voiceSent: 800,
  toSearch: 900,
  searchPress: 320,
  searchOpen: 1060,
  searchClose: 880,
} as const;
