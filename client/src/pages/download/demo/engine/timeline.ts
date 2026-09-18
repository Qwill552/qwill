import { REPLICA_REST, type ReplicaState } from '../replica/phone/demoData';

export type ScrollChannel = 'chatsScroll' | 'feedScroll';

export type ReadoutChannel = 'typing' | 'voice';

export type ContinuousChannel = ScrollChannel | ReadoutChannel;

export const SCROLL_CHANNELS: readonly ScrollChannel[] = ['chatsScroll', 'feedScroll'];

export const READOUT_CHANNELS: readonly ReadoutChannel[] = ['typing', 'voice'];

export const CONTINUOUS_CHANNELS: readonly ContinuousChannel[] = [
  ...SCROLL_CHANNELS,
  ...READOUT_CHANNELS,
];

export type DemoTarget = Record<ContinuousChannel, number> & ReplicaState;

export type EaseName = 'linear' | 'out' | 'inOut';

export interface Scene {
  durationMs: number;
  ease?: EaseName;
  set?: Partial<DemoTarget>;
}

export interface Scenario {
  id: string;
  scenes: Scene[];
}

export const DEMO_REST: DemoTarget = {
  chatsScroll: 0,
  feedScroll: 0,
  typing: 0,
  voice: 0,
  ...REPLICA_REST,
};

const EASES: Record<EaseName, (progress: number) => number> = {
  linear: (progress) => progress,
  out: (progress) => 1 - (1 - progress) ** 3,
  inOut: (progress) => (progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2),
};

export function discreteOf(target: DemoTarget): ReplicaState {
  return {
    screen: target.screen,
    composerText: target.composerText,
    overlay: target.overlay,
    recording: target.recording,
    menuMessageId: target.menuMessageId,
    menuPick: target.menuPick,
    reactionMessageId: target.reactionMessageId,
    visibleMessages: target.visibleMessages,
    readUpTo: target.readUpTo,
  };
}

export function scenarioDuration(scenario: Scenario): number {
  return scenario.scenes.reduce((total, scene) => total + Math.max(0, scene.durationMs), 0);
}

function sceneEndings(scenario: Scenario): DemoTarget[] {
  let carried: DemoTarget = DEMO_REST;
  return scenario.scenes.map((scene) => {
    if (scene.set) carried = { ...carried, ...scene.set };
    return carried;
  });
}

export function targetAt(scenario: Scenario, timeMs: number): DemoTarget {
  const count = scenario.scenes.length;
  const total = scenarioDuration(scenario);
  if (count === 0 || total <= 0) return DEMO_REST;

  const cycleMs = ((timeMs % total) + total) % total;
  const endings = sceneEndings(scenario);

  let index = 0;
  let sceneStartMs = 0;
  while (index < count - 1) {
    const span = Math.max(0, scenario.scenes[index]?.durationMs ?? 0);
    if (sceneStartMs + span > cycleMs) break;
    sceneStartMs += span;
    index += 1;
  }

  const scene = scenario.scenes[index];
  const ending = endings[index];
  const entering = endings[(index + count - 1) % count];
  if (!scene || !ending || !entering) return DEMO_REST;

  const span = Math.max(0, scene.durationMs);
  const progress = span > 0 ? Math.min(1, Math.max(0, (cycleMs - sceneStartMs) / span)) : 1;
  const eased = EASES[scene.ease ?? 'inOut'](progress);

  const moving: DemoTarget = { ...ending };
  for (const channel of CONTINUOUS_CHANNELS) {
    moving[channel] = entering[channel] + (ending[channel] - entering[channel]) * eased;
  }
  return moving;
}
