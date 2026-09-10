const NUM_SAMPLES = 100;
const INFLEXION = 0.35;
const START_TENSION = 0.5;
const END_TENSION = 1;
const P1 = START_TENSION * INFLEXION;
const P2 = 1 - END_TENSION * (1 - INFLEXION);
const DECELERATION_RATE = Math.log(0.78) / Math.log(0.9);
const FLING_FRICTION = 0.015;
const TUNING_COEFF = 9.80665 * 39.37 * 160 * 0.84;
const FLING_SCALE = FLING_FRICTION * TUNING_COEFF;
const MAX_FLING_VELOCITY = 8000;
const MIN_FLING_VELOCITY = 50;
const VELOCITY_HORIZON_MS = 100;
const VELOCITY_SAMPLES = 20;
const POINTER_STOPPED_MS = 40;
const COAST_IDLE_MS = 100;
const SLOP_PX = 10;
const BISECTION_EPSILON = 1e-5;
const BISECTION_LIMIT = 60;

function buildSplinePosition(): Float64Array {
  const table = new Float64Array(NUM_SAMPLES + 1);
  let xMin = 0;
  for (let i = 0; i < NUM_SAMPLES; i += 1) {
    const alpha = i / NUM_SAMPLES;
    let xMax = 1;
    let x = 0;
    let coef = 0;
    for (let guard = 0; guard < BISECTION_LIMIT; guard += 1) {
      x = xMin + (xMax - xMin) / 2;
      coef = 3 * x * (1 - x);
      const tx = coef * ((1 - x) * P1 + x * P2) + x * x * x;
      if (Math.abs(tx - alpha) < BISECTION_EPSILON) break;
      if (tx > alpha) xMax = x;
      else xMin = x;
    }
    table[i] = coef * ((1 - x) * START_TENSION + x) + x * x * x;
  }
  table[NUM_SAMPLES] = 1;
  return table;
}

const SPLINE_POSITION = buildSplinePosition();

function splineDeceleration(speed: number): number {
  return Math.log((INFLEXION * speed) / FLING_SCALE);
}

export function flingDurationSeconds(speed: number): number {
  return Math.exp(splineDeceleration(speed) / (DECELERATION_RATE - 1));
}

export function flingDistance(speed: number): number {
  return FLING_SCALE * Math.exp((DECELERATION_RATE / (DECELERATION_RATE - 1)) * splineDeceleration(speed));
}

export function distanceCoefficient(progress: number): number {
  const index = Math.min(NUM_SAMPLES - 1, Math.floor(NUM_SAMPLES * progress));
  const tInf = index / NUM_SAMPLES;
  const tSup = (index + 1) / NUM_SAMPLES;
  const dInf = SPLINE_POSITION[index] ?? 0;
  const dSup = SPLINE_POSITION[index + 1] ?? 1;
  return dInf + ((progress - tInf) / (tSup - tInf)) * (dSup - dInf);
}

export interface TrackPoint {
  t: number;
  y: number;
}

function solve3(matrix: number[][], rhs: number[]): number[] | null {
  const a = matrix.map((row, index) => [...row, rhs[index] ?? 0]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(a[row]?.[col] ?? 0) > Math.abs(a[pivot]?.[col] ?? 0)) pivot = row;
    }
    const pivotRow = a[pivot];
    const colRow = a[col];
    if (!pivotRow || !colRow || Math.abs(pivotRow[col] ?? 0) < 1e-12) return null;
    a[pivot] = colRow;
    a[col] = pivotRow;
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const current = a[row];
      const base = a[col];
      if (!current || !base) continue;
      const factor = (current[col] ?? 0) / (base[col] ?? 1);
      for (let k = col; k < 4; k += 1) current[k] = (current[k] ?? 0) - factor * (base[k] ?? 0);
    }
  }
  return [
    (a[0]?.[3] ?? 0) / (a[0]?.[0] ?? 1),
    (a[1]?.[3] ?? 0) / (a[1]?.[1] ?? 1),
    (a[2]?.[3] ?? 0) / (a[2]?.[2] ?? 1),
  ];
}

export function fingerVelocity(points: TrackPoint[], release: number): number {
  const recent = points.filter((point) => release - point.t <= VELOCITY_HORIZON_MS).slice(-VELOCITY_SAMPLES);
  if (recent.length < 3) return 0;
  const newest = recent[recent.length - 1];
  if (!newest || release - newest.t > POINTER_STOPPED_MS) return 0;
  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const rhs = [0, 0, 0];
  for (const point of recent) {
    const dt = (point.t - newest.t) / 1000;
    const powers = [1, dt, dt * dt];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const row = matrix[i];
        if (row) row[j] = (row[j] ?? 0) + (powers[i] ?? 0) * (powers[j] ?? 0);
      }
      rhs[i] = (rhs[i] ?? 0) + (powers[i] ?? 0) * point.y;
    }
  }
  const coefficients = solve3(matrix, rhs);
  return coefficients?.[1] ?? 0;
}

export interface FlingTakeover {
  stop(): void;
  destroy(): void;
}

export function attachFlingTakeover(el: HTMLElement): FlingTakeover {
  const points: TrackPoint[] = [];
  let armed = false;
  let touchActive = false;
  let driving = false;
  let axis: 'none' | 'vertical' | 'horizontal' = 'none';
  let originX = 0;
  let originY = 0;
  let originTop = 0;
  let frame = 0;
  let written = 0;
  let delta = 0;
  let durationSeconds = 0;
  let startedAt = 0;
  let idleTimer = 0;

  function maxTop(): number {
    return Math.max(0, el.scrollHeight - el.clientHeight);
  }

  function clampTop(value: number): number {
    return Math.min(maxTop(), Math.max(0, value));
  }

  function reducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function cancelInertia(): void {
    if (frame === 0) return;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function disarm(): void {
    window.clearTimeout(idleTimer);
    idleTimer = 0;
    if (!armed) return;
    armed = false;
    el.removeEventListener('touchstart', onTakeover);
  }

  function arm(): void {
    if (!armed) {
      armed = true;
      el.addEventListener('touchstart', onTakeover, { passive: false });
    }
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(disarm, COAST_IDLE_MS);
  }

  function step(): void {
    frame = 0;
    const drift = el.scrollTop - written;
    if (drift !== 0) originTop += drift;
    const elapsed = (performance.now() - startedAt) / 1000;
    if (elapsed >= durationSeconds) {
      el.scrollTop = clampTop(originTop + delta);
      written = el.scrollTop;
      return;
    }
    const next = clampTop(originTop + distanceCoefficient(elapsed / durationSeconds) * delta);
    el.scrollTop = next;
    written = el.scrollTop;
    if (written <= 0 || written >= maxTop()) return;
    frame = requestAnimationFrame(step);
  }

  function startInertia(beltVelocity: number): void {
    const speed = Math.min(MAX_FLING_VELOCITY, Math.abs(beltVelocity));
    if (speed < MIN_FLING_VELOCITY) return;
    durationSeconds = flingDurationSeconds(speed);
    delta = flingDistance(speed) * Math.sign(beltVelocity);
    originTop = el.scrollTop;
    written = originTop;
    startedAt = performance.now();
    arm();
    frame = requestAnimationFrame(step);
  }

  function onTakeover(event: TouchEvent): void {
    if (event.touches.length !== 1 || reducedMotion()) return;
    cancelInertia();
    driving = true;
    axis = 'none';
    event.preventDefault();
  }

  function onTouchStart(event: TouchEvent): void {
    points.length = 0;
    driving = false;
    axis = 'none';
    touchActive = event.touches.length === 1;
    if (!touchActive) return;
    const touch = event.touches[0];
    if (!touch) return;
    originX = touch.clientX;
    originY = touch.clientY;
    originTop = el.scrollTop;
    points.push({ t: event.timeStamp, y: touch.clientY });
  }

  function onTouchMove(event: TouchEvent): void {
    if (!touchActive || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    points.push({ t: event.timeStamp, y: touch.clientY });
    if (points.length > VELOCITY_SAMPLES * 2) points.splice(0, points.length - VELOCITY_SAMPLES * 2);
    if (!driving) return;
    const dx = touch.clientX - originX;
    const dy = touch.clientY - originY;
    if (axis === 'none') {
      if (Math.abs(dx) > SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
        axis = 'horizontal';
        driving = false;
        return;
      }
      if (Math.abs(dy) <= SLOP_PX) return;
      axis = 'vertical';
      originY = touch.clientY;
      originTop = el.scrollTop;
      return;
    }
    el.scrollTop = clampTop(originTop - (touch.clientY - originY));
  }

  function onTouchEnd(event: TouchEvent): void {
    if (!touchActive) return;
    touchActive = false;
    const velocity = fingerVelocity(points, event.timeStamp);
    points.length = 0;
    if (driving) {
      driving = false;
      if (axis === 'vertical') startInertia(-velocity);
      return;
    }
    if (Math.abs(velocity) >= MIN_FLING_VELOCITY) arm();
  }

  function onTouchCancel(): void {
    touchActive = false;
    driving = false;
    points.length = 0;
  }

  function onScroll(): void {
    if (armed) arm();
  }

  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: true });
  el.addEventListener('touchend', onTouchEnd, { passive: true });
  el.addEventListener('touchcancel', onTouchCancel, { passive: true });
  el.addEventListener('scroll', onScroll, { passive: true });

  return {
    stop(): void {
      cancelInertia();
      driving = false;
      disarm();
    },
    destroy(): void {
      cancelInertia();
      disarm();
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      el.removeEventListener('scroll', onScroll);
    },
  };
}
