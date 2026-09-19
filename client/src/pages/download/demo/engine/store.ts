import { DEMO_REDUCED_FRAME_MS, DEMO_RETURN } from '../../config';
import {
  callDuration,
  recordedTime,
  searchedPrefix,
  typedPrefix,
  type ReplicaScreen,
  type ReplicaState,
  type ScreenSurface,
} from '../replica/phone/demoData';
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
  discreteOf,
  READOUT_CHANNELS,
  SCROLL_CHANNELS,
  targetAt,
  type DemoTarget,
  type ReadoutChannel,
  type Scenario,
  type ScrollChannel,
} from './timeline';

type DiscreteChannel = keyof ReplicaState;

interface BoundSurface {
  viewport: HTMLElement;
  inner: HTMLElement;
  anchor: ScrollAnchor;
  range: ScrollRange | null;
  detach: () => void;
}

export type DemoReadout = (node: HTMLElement | null) => void;

export interface DemoTestSnapshot {
  scenarioMs: number;
  deviation: number;
}

export interface DemoStore {
  subscribe(listener: () => void): () => void;
  snapshot(): ReplicaState;
  surfaceOf(channel: ScrollChannel, anchor: ScrollAnchor): ScreenSurface;
  readoutOf(channel: ReadoutChannel): DemoReadout;
  pointerOf(): DemoReadout;
  override<K extends DiscreteChannel>(channel: K, value: ReplicaState[K]): void;
  setScenario(scenario: Scenario): void;
  mount(root: HTMLElement): () => void;
  readForTests(channel: ScrollChannel): DemoTestSnapshot;
}

const READOUT_TEXT: Record<ReadoutChannel, (value: number, state: ReplicaState) => string> = {
  typing: typedPrefix,
  voice: recordedTime,
  callSeconds: (value) => callDuration(value),
  searchTyping: searchedPrefix,
};

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

export function createDemoStore(initialScenario: Scenario): DemoStore {
  const reduced = prefersReducedMotion();
  const returnConfig: ReturnConfig = reduced
    ? { ...DEMO_RETURN, idleMs: Number.POSITIVE_INFINITY }
    : DEMO_RETURN;
  const discreteIdleMs = reduced ? Number.POSITIVE_INFINITY : DEMO_RETURN.discreteIdleMs;

  let scenario = initialScenario;
  let scenarioMs = reduced ? DEMO_REDUCED_FRAME_MS : 0;
  let target: DemoTarget = targetAt(scenario, scenarioMs);
  let discrete: ReplicaState = discreteOf(target);

  const deviations = new Map<ScrollChannel, ContinuousDeviation>();
  const overrides = new Map<DiscreteChannel, DiscreteOverride<ReplicaState[DiscreteChannel]>>();
  const surfaces = new Map<ScrollChannel, BoundSurface>();
  const handles = new Map<ScrollChannel, ScreenSurface>();
  const painted = new Map<ScrollChannel, number>();
  const readouts = new Map<ReadoutChannel, HTMLElement>();
  const readoutHandles = new Map<ReadoutChannel, DemoReadout>();
  const spelled = new Map<ReadoutChannel, string>();
  const heldValues = new Map<ScrollChannel, number>();
  const listeners = new Set<() => void>();

  let pointerNode: HTMLElement | null = null;
  let pointedAt = '';
  let pointerHandle: DemoReadout | null = null;

  function deviationOf(channel: ScrollChannel): ContinuousDeviation {
    return deviations.get(channel) ?? REST_DEVIATION;
  }

  function rangeOf(channel: ScrollChannel): ScrollRange {
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

  function anchoredTarget(channel: ScrollChannel): number {
    return clampToRange(target[channel], rangeOf(channel));
  }

  function valueOf(channel: ScrollChannel): number {
    return anchoredTarget(channel) + deviationOf(channel).offset;
  }

  function spell(channel: ReadoutChannel): void {
    const node = readouts.get(channel);
    if (!node) return;
    const text = READOUT_TEXT[channel](target[channel], discrete);
    if (spelled.get(channel) === text) return;
    spelled.set(channel, text);
    node.textContent = text;
  }

  function readoutOf(channel: ReadoutChannel): DemoReadout {
    const existing = readoutHandles.get(channel);
    if (existing) return existing;

    const handle: DemoReadout = (node) => {
      if (node) readouts.set(channel, node);
      else readouts.delete(channel);
      spelled.delete(channel);
      spell(channel);
    };

    readoutHandles.set(channel, handle);
    return handle;
  }

  function pointerOf(): DemoReadout {
    if (pointerHandle) return pointerHandle;
    pointerHandle = (node) => {
      pointerNode = node;
      pointedAt = '';
      movePointer();
    };
    return pointerHandle;
  }

  function movePointer(): void {
    if (!pointerNode) return;
    const spot = `translate3d(${Math.round(target.cursorX * 100) / 100}px, ${
      Math.round(target.cursorY * 100) / 100
    }px, 0)`;
    if (pointedAt === spot) return;
    pointedAt = spot;
    pointerNode.style.transform = spot;
  }

  function paint(channel: ScrollChannel): void {
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

    for (const channel of SCROLL_CHANNELS) {
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
    movePointer();

    for (const channel of READOUT_CHANNELS) spell(channel);
  }

  function override<K extends DiscreteChannel>(channel: K, value: ReplicaState[K]): void {
    const nowMs = performance.now();
    overrides.set(channel, { value, atMs: nowMs });
    publish(nowMs);
  }

  function heldOffset(channel: ScrollChannel, fallback: number): number {
    const held = heldValues.get(channel);
    return held === undefined ? fallback : held - anchoredTarget(channel);
  }

  function stopAtEdge(channel: ScrollChannel, state: ContinuousDeviation): ContinuousDeviation {
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
    channel: ScrollChannel,
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

  function unbind(channel: ScrollChannel): void {
    surfaces.get(channel)?.detach();
    surfaces.delete(channel);
    painted.delete(channel);
    heldValues.delete(channel);
  }

  function surfaceOf(channel: ScrollChannel, anchor: ScrollAnchor): ScreenSurface {
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

  function setScenario(next: Scenario): void {
    scenario = next;
    scenarioMs = reduced ? DEMO_REDUCED_FRAME_MS : 0;
    deviations.clear();
    overrides.clear();
    heldValues.clear();
    painted.clear();
    spelled.clear();
    target = targetAt(scenario, scenarioMs);
    discrete = discreteOf(target);
    for (const channel of SCROLL_CHANNELS) paint(channel);
    for (const channel of READOUT_CHANNELS) spell(channel);
    pointedAt = '';
    movePointer();
    for (const listener of listeners) listener();
  }

  function mount(root: HTMLElement): () => void {
    const detachTap = attachTap(root, (node) => {
      const screen = TAPPABLE_SCREENS[node.dataset.demoTap ?? ''];
      if (!screen) return;
      override('screen', screen);
    });
    const stopTicking = onFrame(tick);
    const stopWatching = whileOnScreen(root);

    return () => {
      detachTap();
      stopTicking();
      stopWatching();
    };
  }

  function readForTests(channel: ScrollChannel): DemoTestSnapshot {
    return { scenarioMs, deviation: deviationOf(channel).offset };
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => discrete,
    surfaceOf,
    readoutOf,
    pointerOf,
    override,
    setScenario,
    mount,
    readForTests,
  };
}
