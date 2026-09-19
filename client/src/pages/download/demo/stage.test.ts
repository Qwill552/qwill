import { describe, expect, it } from 'vitest';

import {
  DEMO_FIT,
  DEMO_SCALE,
  LAPTOP_BODY,
  LAPTOP_LID,
  LAPTOP_SCALE,
  PHONE_BODY,
} from '../config';
import {
  bodyOf,
  crossfades,
  deviceFor,
  fitStage,
  reachableDevices,
  reserveHeight,
  sameMetrics,
  scaleOf,
  stageWidth,
  type StageMetrics,
} from './stage';

const WIDTHS = [320, 360, 414, 768, 1024, 1280, 1920, 2560];

const PAGE_GUTTER = 16;
const DEMO_MAX_WIDTH = 1200;

function milli(value: number): number {
  return Math.floor(value * 1000) / 1000;
}

function metricsFor(viewportWidth: number, viewportHeight: number): StageMetrics {
  return {
    hostWidth: Math.min(viewportWidth - PAGE_GUTTER * 2, DEMO_MAX_WIDTH),
    viewportWidth,
    viewportHeight,
  };
}

describe('какое устройство показываем', () => {
  it('в режиме Android всегда телефон', () => {
    for (const width of WIDTHS) expect(deviceFor('android', width)).toBe('phone');
  });

  it('в режиме Windows ноутбук только от 700 и шире', () => {
    expect(deviceFor('windows', 700)).toBe('laptop');
    expect(deviceFor('windows', 1920)).toBe('laptop');
  });

  it('на узком экране Windows показывает широкий экран, а не телефон', () => {
    expect(deviceFor('windows', 320)).toBe('screen');
    expect(deviceFor('windows', 699)).toBe('screen');
  });

  it('телефон на узком экране показывается только в режиме Android', () => {
    expect(reachableDevices(360)).toEqual(['phone', 'screen']);
    expect(reachableDevices(1024)).toEqual(['phone', 'laptop']);
  });

  it('широкий экран — это крышка без основания и клавиатуры', () => {
    expect(bodyOf('screen')).toBe(LAPTOP_LID);
    expect(bodyOf('screen').height).toBeLessThan(bodyOf('laptop').height);
  });
});

describe('устройство не вылезает за край', () => {
  it('ни на одной проверяемой ширине', () => {
    for (const width of WIDTHS) {
      const metrics = metricsFor(width, 900);
      const fit = fitStage(metrics, 0);
      for (const device of reachableDevices(width)) {
        expect(stageWidth(fit, device)).toBeLessThanOrEqual(metrics.hostWidth);
      }
    }
  });

  it('запас под кнопку сценария вычитается с обеих сторон', () => {
    const metrics = metricsFor(1280, 900);
    const fit = fitStage(metrics, 60);
    expect(stageWidth(fit, 'phone')).toBeLessThanOrEqual(metrics.hostWidth - 120);
  });

  it('выступ кнопок телефона учтён в ширине сцены', () => {
    const fit = { phone: 1, laptop: 1, screen: 1 };
    expect(stageWidth(fit, 'phone')).toBe(PHONE_BODY.width + PHONE_BODY.bleed * 2);
  });
});

describe('низкий экран', () => {
  it('выше порога высота ограничивает масштаб', () => {
    const tall = fitStage(metricsFor(1280, 900), 0);
    expect(tall.phone).toBe(milli((900 * DEMO_SCALE.heightRatio) / PHONE_BODY.height));
  });

  it('ниже порога масштаб считается только по ширине', () => {
    const low = fitStage(metricsFor(1280, DEMO_FIT.minFitHeight - 1), 0);
    expect(low.phone).toBe(DEMO_SCALE.max);
    expect(low.laptop).toBe(milli(DEMO_MAX_WIDTH / LAPTOP_BODY.width));
    expect(low.screen).toBe(milli(DEMO_MAX_WIDTH / LAPTOP_LID.width));
  });

  it('у самого порога скачка нет', () => {
    const atLimit = fitStage(metricsFor(360, DEMO_FIT.minFitHeight), 0);
    expect(atLimit.phone).toBe(
      milli((DEMO_FIT.minFitHeight * DEMO_SCALE.heightRatio) / PHONE_BODY.height),
    );
  });
});

describe('высота, отведённая под сцену', () => {
  it('в покое равна высоте показанного устройства', () => {
    const metrics = metricsFor(360, 800);
    const fit = fitStage(metrics, 0);
    expect(reserveHeight(fit, ['phone'])).toBe(PHONE_BODY.height * fit.phone);
    expect(reserveHeight(fit, ['screen'])).toBe(LAPTOP_LID.height * fit.screen);
  });

  it('на время смены устройств держит более высокое из двух', () => {
    const metrics = metricsFor(360, 800);
    const fit = fitStage(metrics, 0);
    const during = reserveHeight(fit, ['screen', 'phone']);
    expect(during).toBe(PHONE_BODY.height * fit.phone);
    expect(during).toBeGreaterThan(reserveHeight(fit, ['screen']));
  });
});

describe('нижний предел масштаба', () => {
  it('не может дать устройство шире доступного места', () => {
    const metrics = metricsFor(320, 900);
    const fit = fitStage(metrics, 0);
    expect(fit.laptop).toBeGreaterThan(LAPTOP_SCALE.min);
    expect(stageWidth(fit, 'laptop')).toBeLessThanOrEqual(metrics.hostWidth);
  });

  it('предел не поднимает масштаб выше того, что влезает по ширине', () => {
    const narrow: StageMetrics = { hostWidth: 120, viewportWidth: 320, viewportHeight: 900 };
    const fit = fitStage(narrow, 0);
    expect(fit.laptop).toBeLessThan(LAPTOP_SCALE.min);
    expect(stageWidth(fit, 'laptop')).toBeLessThanOrEqual(narrow.hostWidth);
  });

  it('тело устройства известно для обоих видов', () => {
    expect(bodyOf('phone')).toBe(PHONE_BODY);
    expect(bodyOf('laptop')).toBe(LAPTOP_BODY);
    expect(scaleOf({ phone: 0.5, laptop: 0.2, screen: 0.3 }, 'laptop')).toBe(0.2);
  });
});

describe('смена устройства', () => {
  it('на широком экране идёт кроссфейдом, на узком — сразу', () => {
    expect(crossfades(1024)).toBe(true);
    expect(crossfades(700)).toBe(true);
    expect(crossfades(699)).toBe(false);
    expect(crossfades(360)).toBe(false);
  });
});

describe('измерения сцены', () => {
  it('одинаковые размеры не считаются изменением', () => {
    const one: StageMetrics = { hostWidth: 328, viewportWidth: 360, viewportHeight: 800 };
    expect(sameMetrics(one, { ...one })).toBe(true);
    expect(sameMetrics(one, { ...one, viewportHeight: 801 })).toBe(false);
    expect(sameMetrics(one, { ...one, hostWidth: 327 })).toBe(false);
  });
});
