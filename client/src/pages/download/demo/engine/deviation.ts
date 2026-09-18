const MS_PER_SECOND = 1000;

export interface ContinuousDeviation {
  offset: number;
  velocity: number;
  holding: boolean;
  settling: boolean;
  releasedAtMs: number;
}

export interface ReturnConfig {
  idleMs: number;
  inertiaTauMs: number;
  springStiffness: number;
  springDamping: number;
  springStepMs: number;
  settleOffset: number;
  settleVelocity: number;
}

export const REST_DEVIATION: ContinuousDeviation = {
  offset: 0,
  velocity: 0,
  holding: false,
  settling: false,
  releasedAtMs: 0,
};

export function holdDeviation(state: ContinuousDeviation, offset: number): ContinuousDeviation {
  return { ...state, offset, velocity: 0, holding: true, settling: false };
}

export function releaseDeviation(
  state: ContinuousDeviation,
  velocity: number,
  nowMs: number,
): ContinuousDeviation {
  return { ...state, velocity, holding: false, settling: false, releasedAtMs: nowMs };
}

export function settleDeviation(state: ContinuousDeviation): ContinuousDeviation {
  return { ...state, holding: false, settling: true };
}

export function isGliding(state: ContinuousDeviation, nowMs: number, config: ReturnConfig): boolean {
  if (state.holding || state.settling) return false;
  return nowMs - state.releasedAtMs < config.idleMs;
}

export function isResting(state: ContinuousDeviation): boolean {
  return !state.holding && state.offset === 0 && state.velocity === 0;
}

function glide(
  state: ContinuousDeviation,
  dtMs: number,
  config: ReturnConfig,
): ContinuousDeviation {
  return {
    ...state,
    offset: state.offset + state.velocity * dtMs,
    velocity: state.velocity * Math.exp(-dtMs / config.inertiaTauMs),
  };
}

function settleToTarget(
  state: ContinuousDeviation,
  dtMs: number,
  config: ReturnConfig,
): ContinuousDeviation {
  let offset = state.offset;
  let velocity = state.velocity * MS_PER_SECOND;
  let leftMs = dtMs;

  while (leftMs > 0) {
    const stepMs = Math.min(config.springStepMs, leftMs);
    const stepSeconds = stepMs / MS_PER_SECOND;
    leftMs -= stepMs;

    const pull = -config.springStiffness * offset - config.springDamping * velocity;
    velocity += pull * stepSeconds;
    const next = offset + velocity * stepSeconds;

    if (Math.sign(next) !== Math.sign(offset)) {
      offset = 0;
      velocity = 0;
      break;
    }
    offset = next;
  }

  const arrived =
    Math.abs(offset) <= config.settleOffset &&
    Math.abs(velocity / MS_PER_SECOND) <= config.settleVelocity;

  if (arrived) return { ...state, offset: 0, velocity: 0, settling: false };
  return { ...state, offset, velocity: velocity / MS_PER_SECOND };
}

export function advanceDeviation(
  state: ContinuousDeviation,
  dtMs: number,
  nowMs: number,
  config: ReturnConfig,
): ContinuousDeviation {
  if (state.holding || dtMs <= 0) return state;
  if (isResting(state)) return state;
  if (isGliding(state, nowMs, config)) return glide(state, dtMs, config);
  return settleToTarget(state, dtMs, config);
}

export interface DiscreteOverride<Value> {
  value: Value;
  atMs: number;
}

export function isOverrideAlive<Value>(
  override: DiscreteOverride<Value>,
  nowMs: number,
  idleMs: number,
): boolean {
  return nowMs - override.atMs < idleMs;
}
