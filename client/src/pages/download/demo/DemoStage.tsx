import type { AnimationEvent, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  DEMO_SCALE,
  LAPTOP_BODY,
  LAPTOP_SCALE,
  PHONE_BODY,
  SCENARIO_SWITCH,
} from '../config';
import { LaptopShell } from '../devices/LaptopShell';
import { PhoneShell } from '../devices/PhoneShell';
import type { OsChoice } from '../useOsChoice';
import { createDemoStore } from './engine/store';
import { PhoneDemo } from './PhoneDemo';
import { LaptopReplica } from './replica/laptop/LaptopReplica';
import styles from './DemoStage.module.css';
import { ScenarioSwitch } from './ScenarioSwitch';
import { EVERYDAY_SCENARIO } from './scenarios/everyday';

const SCENARIOS = [EVERYDAY_SCENARIO];

const store = createDemoStore(SCENARIOS[0]!);

const SWITCHABLE = SCENARIOS.length > 1;

const RESERVED_WIDTH = SWITCHABLE ? SCENARIO_SWITCH.buttonSize + SCENARIO_SWITCH.gap : 0;

interface DeviceMetrics {
  width: number;
  height: number;
}

interface ScaleLimits {
  max: number;
  min: number;
  heightRatio: number;
}

interface StageFit {
  phone: number;
  laptop: number;
}

const INITIAL_FIT: StageFit = { phone: DEMO_SCALE.min, laptop: LAPTOP_SCALE.min };

function fitDevice(
  available: number,
  viewportHeight: number,
  body: DeviceMetrics,
  limits: ScaleLimits,
): number {
  const byWidth = available / body.width;
  const byHeight = (viewportHeight * limits.heightRatio) / body.height;
  const fit = Math.min(byWidth, byHeight, limits.max);
  const floor = Math.min(limits.min, byWidth);
  return Math.max(Math.round(fit * 1000) / 1000, floor);
}

function fitStage(hostWidth: number, viewportHeight: number): StageFit {
  return {
    phone: fitDevice(hostWidth - RESERVED_WIDTH * 2, viewportHeight, PHONE_BODY, DEMO_SCALE),
    laptop: fitDevice(hostWidth, viewportHeight, LAPTOP_BODY, LAPTOP_SCALE),
  };
}

function bodyOf(os: OsChoice): DeviceMetrics {
  return os === 'windows' ? LAPTOP_BODY : PHONE_BODY;
}

function scaleOf(fit: StageFit, os: OsChoice): number {
  return os === 'windows' ? fit.laptop : fit.phone;
}

type ScrimPhase = 'idle' | 'toDark' | 'toClear';

interface DeviceSlotProps {
  os: OsChoice;
  fit: StageFit;
  animation: string | undefined;
  onAnimationEnd: () => void;
  children: ReactNode;
}

function DeviceSlot({ os, fit, animation, onAnimationEnd, children }: DeviceSlotProps) {
  const body = bodyOf(os);
  return (
    <div
      className={styles.slot}
      style={{
        ['--slot-width' as string]: `${body.width}px`,
        ['--slot-height' as string]: `${body.height}px`,
        ['--slot-scale' as string]: scaleOf(fit, os),
      }}
    >
      <div
        className={animation ? `${styles.fade} ${animation}` : styles.fade}
        onAnimationEnd={(event: AnimationEvent<HTMLDivElement>) => {
          if (event.target === event.currentTarget) onAnimationEnd();
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function DemoStage({ os }: { os: OsChoice }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<StageFit>(INITIAL_FIT);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [scrimPhase, setScrimPhase] = useState<ScrimPhase>('idle');
  const [shownOs, setShownOs] = useState<OsChoice>(os);
  const [leavingOs, setLeavingOs] = useState<OsChoice | null>(null);
  const [entering, setEntering] = useState(false);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = document.documentElement;
    const update = () => setFit(fitStage(host.clientWidth, root.clientHeight));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (os === shownOs) return;
    setLeavingOs(shownOs);
    setShownOs(os);
    setEntering(true);
  }, [os, shownOs]);

  function handleSwitch(): void {
    if (scrimPhase !== 'idle') return;
    setScrimPhase('toDark');
  }

  function handleScrimTransitionEnd(): void {
    if (scrimPhase === 'toDark') {
      const nextIndex = (scenarioIndex + 1) % SCENARIOS.length;
      store.setScenario(SCENARIOS[nextIndex]!);
      setScenarioIndex(nextIndex);
      setScrimPhase('toClear');
      return;
    }
    if (scrimPhase === 'toClear') setScrimPhase('idle');
  }

  function renderDevice(target: OsChoice) {
    if (target === 'windows') {
      return (
        <LaptopShell>
          <LaptopReplica />
        </LaptopShell>
      );
    }
    return (
      <PhoneShell>
        <PhoneDemo
          store={store}
          scenarioScrimLit={scrimPhase === 'toDark'}
          onScenarioScrimTransitionEnd={handleScrimTransitionEnd}
        />
      </PhoneShell>
    );
  }

  const shownBody = bodyOf(shownOs);
  const shownScale = scaleOf(fit, shownOs);
  const reservedHeight = Math.max(
    PHONE_BODY.height * fit.phone,
    LAPTOP_BODY.height * fit.laptop,
  );

  return (
    <div ref={hostRef} className={styles.host}>
      <div className={styles.reserve} style={{ height: `${reservedHeight}px` }}>
        <div
          className={styles.frame}
          style={{
            width: `${shownBody.width * shownScale}px`,
            height: `${shownBody.height * shownScale}px`,
          }}
        >
          <div className={styles.slots} aria-hidden="true">
            {leavingOs !== null && (
              <DeviceSlot
                key={`leaving-${leavingOs}`}
                os={leavingOs}
                fit={fit}
                animation={styles.leave}
                onAnimationEnd={() => setLeavingOs(null)}
              >
                {renderDevice(leavingOs)}
              </DeviceSlot>
            )}
            <DeviceSlot
              key={shownOs}
              os={shownOs}
              fit={fit}
              animation={entering ? styles.enter : undefined}
              onAnimationEnd={() => setEntering(false)}
            >
              {renderDevice(shownOs)}
            </DeviceSlot>
          </div>

          {SWITCHABLE && shownOs === 'android' && (
            <ScenarioSwitch
              activeIndex={scenarioIndex}
              count={SCENARIOS.length}
              disabled={scrimPhase !== 'idle'}
              onSwitch={handleSwitch}
            />
          )}
        </div>
      </div>
    </div>
  );
}
