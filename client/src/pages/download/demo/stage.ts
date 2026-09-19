import {
  DEMO_FIT,
  DEMO_SCALE,
  DOWNLOAD_BREAKPOINTS,
  LAPTOP_BODY,
  LAPTOP_SCALE,
  PHONE_BODY,
} from '../config';
import type { OsChoice } from '../useOsChoice';

export type DemoDevice = 'phone' | 'laptop';

export interface DeviceMetrics {
  width: number;
  height: number;
  bleed: number;
}

interface ScaleLimits {
  max: number;
  min: number;
  heightRatio: number;
}

export interface StageFit {
  phone: number;
  laptop: number;
}

export interface StageMetrics {
  hostWidth: number;
  viewportWidth: number;
  viewportHeight: number;
}

const BODIES: Record<DemoDevice, DeviceMetrics> = {
  phone: PHONE_BODY,
  laptop: LAPTOP_BODY,
};

export const INITIAL_FIT: StageFit = { phone: DEMO_SCALE.min, laptop: LAPTOP_SCALE.min };

export function bodyOf(device: DemoDevice): DeviceMetrics {
  return BODIES[device];
}

export function scaleOf(fit: StageFit, device: DemoDevice): number {
  return fit[device];
}

export function deviceFor(os: OsChoice, viewportWidth: number): DemoDevice {
  if (os !== 'windows') return 'phone';
  return viewportWidth >= DOWNLOAD_BREAKPOINTS.tablet ? 'laptop' : 'phone';
}

export function reachableDevices(viewportWidth: number): DemoDevice[] {
  return viewportWidth >= DOWNLOAD_BREAKPOINTS.tablet ? ['phone', 'laptop'] : ['phone'];
}

function fitDevice(
  available: number,
  viewportHeight: number,
  body: DeviceMetrics,
  limits: ScaleLimits,
): number {
  const byWidth = available / (body.width + body.bleed * 2);
  const byHeight =
    viewportHeight >= DEMO_FIT.minFitHeight
      ? (viewportHeight * limits.heightRatio) / body.height
      : Number.POSITIVE_INFINITY;
  const fit = Math.min(byWidth, byHeight, limits.max);
  const floor = Math.min(limits.min, byWidth);
  return Math.max(Math.floor(fit * 1000) / 1000, floor);
}

export function fitStage(metrics: StageMetrics, reservedWidth: number): StageFit {
  return {
    phone: fitDevice(
      metrics.hostWidth - reservedWidth * 2,
      metrics.viewportHeight,
      PHONE_BODY,
      DEMO_SCALE,
    ),
    laptop: fitDevice(metrics.hostWidth, metrics.viewportHeight, LAPTOP_BODY, LAPTOP_SCALE),
  };
}

export function reserveHeight(fit: StageFit, viewportWidth: number): number {
  return reachableDevices(viewportWidth).reduce(
    (tallest, device) => Math.max(tallest, bodyOf(device).height * scaleOf(fit, device)),
    0,
  );
}

export function stageWidth(fit: StageFit, device: DemoDevice): number {
  const body = bodyOf(device);
  return (body.width + body.bleed * 2) * scaleOf(fit, device);
}
