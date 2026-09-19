import { describe, expect, it } from 'vitest';

import { createDemoStore } from '../engine/store';
import { discreteOf, scenarioDuration, targetAt, type DemoTarget } from '../engine/timeline';
import { DISTINCT_SCENARIO } from './distinct';
import { EVERYDAY_SCENARIO } from './everyday';

const CYCLE_MS = 20000;

function at(timeMs: number): DemoTarget {
  return targetAt(DISTINCT_SCENARIO, timeMs);
}

function sceneStart(index: number): number {
  return DISTINCT_SCENARIO.scenes.slice(0, index).reduce((total, scene) => total + scene.durationMs, 0);
}

describe('сценарий Б', () => {
  it('круг длится ровно 20 секунд', () => {
    expect(scenarioDuration(DISTINCT_SCENARIO)).toBe(CYCLE_MS);
  });

  it('начинается со списка чатов, лента едет от нуля', () => {
    const start = at(0);
    expect(start.screen).toBe('chats');
    expect(start.chatsScroll).toBeCloseTo(0);
    expect(at(sceneStart(1) - 1).chatsScroll).toBeGreaterThan(100);
  });

  it('профиль открывается на второй сцене и прокручивается до визитки', () => {
    expect(at(sceneStart(1) - 1).screen).toBe('chats');
    expect(at(sceneStart(1)).screen).toBe('profile');
    expect(at(sceneStart(1)).profileScroll).toBeCloseTo(0);
    expect(at(sceneStart(2)).profileScroll).toBeGreaterThan(500);
    expect(at(sceneStart(3) - 1).profileScroll).toBe(at(sceneStart(2)).profileScroll);
  });

  it('обои перебирают три варианта по очереди', () => {
    expect(at(sceneStart(3)).screen).toBe('wallpaper');
    expect(at(sceneStart(3)).wallpaperIndex).toBe(0);
    expect(at(sceneStart(4)).wallpaperIndex).toBe(1);
    expect(at(sceneStart(5)).wallpaperIndex).toBe(2);
    expect(at(sceneStart(6) - 1).wallpaperIndex).toBe(2);
  });

  it('звонок сперва входящий, потом разговор с идущим таймером', () => {
    expect(at(sceneStart(6)).screen).toBe('call');
    expect(at(sceneStart(6)).callConnected).toBe(false);
    expect(at(sceneStart(7) - 1).callConnected).toBe(false);
    expect(at(sceneStart(7)).callConnected).toBe(true);
    expect(at(sceneStart(7)).callSeconds).toBeCloseTo(0);
    expect(at(sceneStart(8) - 1).callSeconds).toBeGreaterThan(1.9);
  });

  it('QR-код держится без движения', () => {
    expect(at(sceneStart(8)).screen).toBe('qr');
    expect(at(sceneStart(9) - 1).screen).toBe('qr');
  });

  it('настройки открываются наверху и докручиваются до строки лицензии', () => {
    expect(at(sceneStart(9)).screen).toBe('settings');
    expect(at(sceneStart(9)).settingsScroll).toBeCloseTo(0);
    expect(at(sceneStart(10)).settingsScroll).toBeCloseTo(0);
    expect(at(CYCLE_MS - 1).settingsScroll).toBeGreaterThan(500);
  });

  it('шва не видно: конец круга и его начало совпадают дискретно и непрерывно', () => {
    const before = at(CYCLE_MS - 1);
    const after = at(CYCLE_MS);
    expect(discreteOf(after)).toEqual(discreteOf(at(0)));
    expect(Math.abs(before.chatsScroll - after.chatsScroll)).toBeLessThan(0.5);
  });

  it('круг повторяется без накопления', () => {
    for (const timeMs of [0, 2500, 8900, 13200, 17600]) {
      expect(at(timeMs)).toEqual(at(timeMs + CYCLE_MS));
      expect(at(timeMs)).toEqual(at(timeMs + CYCLE_MS * 5));
    }
  });

  it('кадр для prefers-reduced-motion показывает читаемый экран настроек', () => {
    const frozen = at(18000);
    expect(frozen.screen).toBe('settings');
    expect(frozen.settingsScroll).toBeCloseTo(0);
  });
});

describe('переключение сценария через store.setScenario', () => {
  it('переход на сценарий Б начинается с его собственного начала, а не с хвоста прежнего', () => {
    const store = createDemoStore(EVERYDAY_SCENARIO);
    store.setScenario(DISTINCT_SCENARIO);
    expect(store.snapshot()).toEqual(discreteOf(targetAt(DISTINCT_SCENARIO, 0)));
  });

  it('переход обратно на А тоже начинается заново', () => {
    const store = createDemoStore(DISTINCT_SCENARIO);
    store.setScenario(EVERYDAY_SCENARIO);
    expect(store.snapshot()).toEqual(discreteOf(targetAt(EVERYDAY_SCENARIO, 0)));
  });
});
