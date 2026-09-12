const DECELERATION_RATE = Math.log(0.75) / Math.log(0.9);
const START_TENSION = 0.4;
const END_TENSION = 1 - START_TENSION;
const ALPHA = 800;
const NB_SAMPLES = 100;

export const MIN_FLING_VELOCITY = 50;
export const MAX_FLING_VELOCITY = 1000;

const SPLINE = buildSpline();

function buildSpline(): number[] {
  const spline = new Array<number>(NB_SAMPLES + 1);
  let xMin = 0;
  for (let i = 0; i <= NB_SAMPLES; i += 1) {
    const t = i / NB_SAMPLES;
    let xMax = 1;
    let x: number;
    let coef: number;
    for (;;) {
      x = xMin + (xMax - xMin) / 2;
      coef = 3 * x * (1 - x);
      const tx = coef * ((1 - x) * START_TENSION + x * END_TENSION) + x * x * x;
      if (Math.abs(tx - t) < 1e-5) break;
      if (tx > t) xMax = x;
      else xMin = x;
    }
    spline[i] = coef + x * x * x;
  }
  spline[NB_SAMPLES] = 1;
  return spline;
}

const VISCOUS_FLUID_SCALE = 8;
const VISCOUS_FLUID_NORMALIZE = 1 / rawViscousFluid(1);

function rawViscousFluid(input: number): number {
  let x = input * VISCOUS_FLUID_SCALE;
  if (x < 1) {
    x -= 1 - Math.exp(-x);
  } else {
    const start = 0.36787944117;
    x = 1 - Math.exp(1 - x);
    x = start + x * (1 - start);
  }
  return x;
}

export function viscousFluid(progress: number): number {
  return rawViscousFluid(progress) * VISCOUS_FLUID_NORMALIZE;
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (progress: number) => number {
  const axis = (t: number, a: number, b: number): number =>
    3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;

  return (progress) => {
    let low = 0;
    let high = 1;
    let t = progress;
    for (let step = 0; step < 32; step += 1) {
      const x = axis(t, x1, x2);
      if (Math.abs(x - progress) < 1e-5) break;
      if (x > progress) high = t;
      else low = t;
      t = (low + high) / 2;
    }
    return axis(t, y1, y2);
  };
}

const edgeCurve = cubicBezier(0, 0.5, 0.5, 1);

export function edgeFalloff(progress: number): number {
  return edgeCurve(Math.min(1, Math.max(0, progress)));
}

export function decelerate(progress: number): number {
  return 1 - (1 - progress) ** 5;
}

export function clampFlingVelocity(velocity: number): number {
  const capped = Math.min(Math.abs(velocity), MAX_FLING_VELOCITY);
  return velocity < 0 ? -capped : capped;
}

export interface Fling {
  durationMs: number;
  distance: number;
}

export function flingOf(velocity: number): Fling {
  const speed = Math.abs(velocity);
  if (speed < 1) return { durationMs: 0, distance: 0 };

  const l = Math.log((START_TENSION * speed) / ALPHA);
  const durationMs = 1000 * Math.exp(l / (DECELERATION_RATE - 1));
  const distance = ALPHA * Math.exp((DECELERATION_RATE / (DECELERATION_RATE - 1)) * l);
  return { durationMs, distance: velocity < 0 ? -distance : distance };
}

export function flingProgress(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;

  const index = Math.floor(NB_SAMPLES * progress);
  const tInf = index / NB_SAMPLES;
  const tSup = (index + 1) / NB_SAMPLES;
  const dInf = SPLINE[index]!;
  const dSup = SPLINE[index + 1]!;
  return dInf + ((progress - tInf) / (tSup - tInf)) * (dSup - dInf);
}
