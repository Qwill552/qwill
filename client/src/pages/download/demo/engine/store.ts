import { DEMO_REDUCED_FRAME_MS, DEMO_RETURN } from '../../config';
import type { ReplicaScreen, ReplicaState, ScreenSurface } from '../replica/phone/demoData';
import { onFrame, whileOnScreen } from './clock';
import {
  advanceDeviation,
  holdDeviation,
  isGliding,
  REST_DEVIATION,
  releaseDeviation,
  settleDeviation,
  type ContinuousDeviation,
  type DiscreteOverride,
  type ReturnConfig,
} from './deviation';
import {
  attachScroller,
  attachTap,
  clampToRange,
  EMPTY_RANGE,
  type ScrollAnchor,
  type ScrollRange,
} from './scroller';
import {
  CONTINUOUS_CHANNELS,
  discreteOf,
  targetAt,
  type ContinuousChannel,
  type DemoTarget,
  type Scenario,
} from './timeline';

type DiscreteChannel = keyof ReplicaState;

interface BoundSurface {
  viewport: HTMLElement;
  inner: HTMLElement;
  anchor: ScrollAnchor;
  range: ScrollRange | null;
  detach: () => void;
}

export interface DemoStore {
  subscribe(listener: () => void): () => void;
  snapshot(): ReplicaState;
  surfaceOf(channel: ContinuousChannel, anchor: ScrollAnchor): ScreenSurface;
  mount(root: HTMLElement): () => void;
}

const TAPPABLE_SCREENS: Record<string, ReplicaScreen> = {
  chat: 'chat',
  chats: 'chats',
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sameDiscrete(left: ReplicaState, right: ReplicaState): boolean {
  return (Object.keys(left) as DiscreteChannel[]).every((key) => left[key] === right[key]);
}

export function createDemoStore(scenario: Scenario): DemoStore {
  const reduced = prefersReducedMotion();
  const returnConfig: ReturnConfig = reduced
    ? { ...DEMO_RETURN, idleMs: Number.POSITIVE_INFINITY }
    : DEMO_RETURN;
  const discreteIdleMs = reduced ? Number.POSITIVE_INFINITY : DEMO_RETURN.discreteIdleMs;

  let scenarioMs = reduced ? DEMO_REDUCED_FRAME_MS : 0;
  let target: DemoTarget = targetAt(scenario, scenarioMs);
  let discrete: ReplicaState = discreteOf(target);

  const deviations = new Map<ContinuousChannel, ContinuousDeviation>();
  const overrides = new Map<DiscreteChannel, DiscreteOverride<ReplicaState[DiscreteChannel]>>();
  const surfaces = new Map<ContinuousChannel, BoundSurface>();
  const handles = new Map<ContinuousChannel, ScreenSurface>();
  const painted = new Map<ContinuousChannel, number>();
  const heldValues = new Map<ContinuousChannel, number>();
  const listeners = new Set<() => void>();

  function deviationOf(channel: ContinuousChannel): ContinuousDeviation {
    return deviations.get(channel) ?? REST_DEVIATION;
  }

  function rangeOf(channel: ContinuousChannel): ScrollRange {
    const surface = surfaces.get(channel);
    if (!surface) return EMPTY_RANGE;
    if (surface.range) return surface.range;
    const extent = surface.viewport.clientHeight;
    const overflow = Math.max(0, surface.inner.offsetHeight - extent);
    surface.range =
      surface.anchor === 'top'
        ? { min: 0, max: overflow, extent }
        : { min: -overflow, max: 0, extent };
    return surface.range;
  }

  function anchoredTarget(channel: ContinuousChannel): number {
    return clampToRange(target[channel], rangeOf(channel));
  }

  function valueOf(channel: ContinuousChannel): number {
    return anchoredTarget(channel) + deviationOf(channel).offset;
  }

  function paint(channel: ContinuousChannel): void {
    const surface = surfaces.get(channel);
    if (!surface) return;
    const value = Math.round(valueOf(channel) * 100) / 100;
    if (painted.get(channel) === value) return;
    painted.set(channel, value);
    surface.inner.style.transform = `translate3d(0, ${-value}px, 0)`;
  }

  function resolveDiscrete(nowMs: number): ReplicaState {
    const resolved = discreteOf(target);
    for (const [channel, override] of overrides) {
      if (nowMs - override.atMs >= discreteIdleMs) {
        overrides.delete(channel);
        continue;
      }
      Object.assign(resolved, { [channel]: override.value });
    }
    return resolved;
  }

  function publish(nowMs: number): void {
    const resolved = resolveDiscrete(nowMs);
    if (sameDiscrete(resolved, discrete)) return;
    discrete = resolved;
    for (const listener of listeners) listener();
  }

  function tick(dtMs: number, nowMs: number): void {
    if (!reduced) scenarioMs += dtMs;
    target = targetAt(scenario, scenarioMs);

    for (const channel of CONTINUOUS_CHANNELS) {
      const current = deviations.get(channel);
      if (current?.holding) {
        deviations.set(channel, holdDeviation(current, heldOffset(channel, current.offset)));
      } else if (current) {
        const glided = isGliding(current, nowMs, returnConfig);
        const advanced = advanceDeviation(current, dtMs, nowMs, returnConfig);
        deviations.set(channel, glided ? stopAtEdge(channel, advanced) : advanced);
      }
      paint(channel);
    }

    publish(nowMs);
  }

  function heldOffset(channel: ContinuousChannel, fallback: number): number {
    const held = heldValues.get(channel);
    return held === undefined ? fallback : held - anchoredTarget(channel);
  }

  function stopAtEdge(channel: ContinuousChannel, state: ContinuousDeviation): ContinuousDeviation {
    const range = rangeOf(channel);
    const anchored = anchoredTarget(channel);
    const value = anchored + state.offset;
    if (value >= range.min && value <= range.max) return state;
    return settleDeviation({
      ...state,
      offset: clampToRange(value, range) - anchored,
      velocity: 0,
    });
  }

  function bind(
    channel: ContinuousChannel,
    viewport: HTMLElement,
    inner: HTMLElement,
    anchor: ScrollAnchor,
  ): void {
    const sizes = new ResizeObserver(() => {
      const bound = surfaces.get(channel);
      if (bound) bound.range = null;
    });
    sizes.observe(viewport);
    sizes.observe(inner);

    const detachScroller = attachScroller(viewport, {
      range: () => rangeOf(channel),
      value: () => valueOf(channel),
      drag: (value) => {
        heldValues.set(channel, value);
        deviations.set(channel, holdDeviation(deviationOf(channel), value - anchoredTarget(channel)));
        paint(channel);
      },
      release: (value, velocity, beyondRange) => {
        heldValues.delete(channel);
        const held = holdDeviation(deviationOf(channel), value - anchoredTarget(channel));
        const released = releaseDeviation(held, velocity, performance.now());
        deviations.set(channel, beyondRange ? settleDeviation(released) : released);
      },
    });

    surfaces.set(channel, {
      viewport,
      inner,
      anchor,
      range: null,
      detach: () => {
        sizes.disconnect();
        detachScroller();
      },
    });
    painted.delete(channel);
    paint(channel);
  }

  function unbind(channel: ContinuousChannel): void {
    surfaces.get(channel)?.detach();
    surfaces.delete(channel);
    painted.delete(channel);
    heldValues.delete(channel);
  }

  function surfaceOf(channel: ContinuousChannel, anchor: ScrollAnchor): ScreenSurface {
    const existing = handles.get(channel);
    if (existing) return existing;

    let viewport: HTMLElement | null = null;
    let inner: HTMLElement | null = null;

    const rebind = (): void => {
      unbind(channel);
      if (viewport && inner) bind(channel, viewport, inner, anchor);
    };

    const handle: ScreenSurface = {
      viewport: (node) => {
        viewport = node;
        rebind();
      },
      inner: (node) => {
        inner = node;
        rebind();
      },
    };

    handles.set(channel, handle);
    return handle;
  }

  function mount(root: HTMLElement): () => void {
    const detachTap = attachTap(root, (node) => {
      const screen = TAPPABLE_SCREENS[node.dataset.demoTap ?? ''];
      if (!screen) return;
      const nowMs = performance.now();
      overrides.set('screen', { value: screen, atMs: nowMs });
      publish(nowMs);
    });
    const stopTicking = onFrame(tick);
    const stopWatching = whileOnScreen(root);

    return () => {
      detachTap();
      stopTicking();
      stopWatching();
    };
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => discrete,
    surfaceOf,
    mount,
  };
}
