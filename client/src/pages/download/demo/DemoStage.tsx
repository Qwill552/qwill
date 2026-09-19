import type { AnimationEvent, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { DOWNLOAD_BREAKPOINTS, SCENARIO_SWITCH } from '../config';
import { LaptopShell } from '../devices/LaptopShell';
import { PhoneShell } from '../devices/PhoneShell';
import type { OsChoice } from '../useOsChoice';
import { createDemoStore } from './engine/store';
import { LaptopDemo } from './LaptopDemo';
import { PhoneDemo } from './PhoneDemo';
import styles from './DemoStage.module.css';
import { ScenarioSwitch } from './ScenarioSwitch';
import { DESKTOP_EVERYDAY_SCENARIO } from './scenarios/desktopEveryday';
import { EVERYDAY_SCENARIO } from './scenarios/everyday';
import {
  bodyOf,
  crossfades,
  deviceFor,
  fitStage,
  INITIAL_FIT,
  reserveHeight,
  sameMetrics,
  scaleOf,
  stageWidth,
  type DemoDevice,
  type StageFit,
  type StageMetrics,
} from './stage';

const SCENARIOS = [EVERYDAY_SCENARIO];

const DESKTOP_SCENARIOS = [DESKTOP_EVERYDAY_SCENARIO];

const store = createDemoStore(SCENARIOS[0]!);

if (typeof window !== 'undefined') {
  Object.assign(window, { __downloadDemoTest: store.readForTests });
}

const laptopStore = createDemoStore(DESKTOP_SCENARIOS[0]!);

const screenStore = createDemoStore(DESKTOP_SCENARIOS[0]!);

const SWITCHABLE = SCENARIOS.length > 1;

const RESERVED_WIDTH = SWITCHABLE ? SCENARIO_SWITCH.buttonSize + SCENARIO_SWITCH.gap : 0;

type ScrimPhase = 'idle' | 'toDark' | 'toClear';

interface DeviceSlotProps {
  device: DemoDevice;
  fit: StageFit;
  animation: string | undefined;
  onAnimationEnd: () => void;
  children: ReactNode;
}

function DeviceSlot({ device, fit, animation, onAnimationEnd, children }: DeviceSlotProps) {
  const body = bodyOf(device);
  return (
    <div
      className={styles.slot}
      style={{
        ['--slot-width' as string]: `${body.width}px`,
        ['--slot-height' as string]: `${body.height}px`,
        ['--slot-scale' as string]: scaleOf(fit, device),
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

function readViewport(): StageMetrics {
  if (typeof document === 'undefined') {
    return { hostWidth: 0, viewportWidth: DOWNLOAD_BREAKPOINTS.desktop, viewportHeight: 0 };
  }
  const root = document.documentElement;
  return { hostWidth: 0, viewportWidth: root.clientWidth, viewportHeight: root.clientHeight };
}

export function DemoStage({ os }: { os: OsChoice }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<StageMetrics>(readViewport);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [scrimPhase, setScrimPhase] = useState<ScrimPhase>('idle');
  const [shownDevice, setShownDevice] = useState<DemoDevice>(() =>
    deviceFor(os, readViewport().viewportWidth),
  );
  const [leavingDevice, setLeavingDevice] = useState<DemoDevice | null>(null);
  const [entering, setEntering] = useState(false);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = document.documentElement;
    let pending = 0;

    const measure = () => {
      pending = 0;
      const next: StageMetrics = {
        hostWidth: host.clientWidth,
        viewportWidth: root.clientWidth,
        viewportHeight: root.clientHeight,
      };
      setMetrics((current) => (sameMetrics(current, next) ? current : next));
    };

    measure();
    const observer = new ResizeObserver(() => {
      if (pending !== 0) return;
      pending = requestAnimationFrame(measure);
    });
    observer.observe(host);
    observer.observe(root);
    return () => {
      if (pending !== 0) cancelAnimationFrame(pending);
      observer.disconnect();
    };
  }, []);

  const fit = metrics.hostWidth > 0 ? fitStage(metrics, RESERVED_WIDTH) : INITIAL_FIT;
  const device = deviceFor(os, metrics.viewportWidth);

  useEffect(() => {
    if (device === shownDevice) return;
    const smooth = crossfades(metrics.viewportWidth);
    setLeavingDevice(smooth ? shownDevice : null);
    setShownDevice(device);
    setEntering(smooth);
  }, [device, shownDevice, metrics.viewportWidth]);

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

  function renderDevice(target: DemoDevice) {
    if (target === 'laptop' || target === 'screen') {
      const bare = target === 'screen';
      return (
        <LaptopShell bare={bare}>
          <LaptopDemo store={bare ? screenStore : laptopStore} />
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

  const shownBody = bodyOf(shownDevice);
  const shownScale = scaleOf(fit, shownDevice);
  const inPlay: DemoDevice[] = leavingDevice === null ? [shownDevice] : [shownDevice, leavingDevice];

  return (
    <div ref={hostRef} className={styles.host}>
      <div className={styles.reserve} style={{ height: `${reserveHeight(fit, inPlay)}px` }}>
        <div
          className={styles.frame}
          style={{
            width: `${stageWidth(fit, shownDevice)}px`,
            height: `${shownBody.height * shownScale}px`,
          }}
        >
          <div className={styles.slots} aria-hidden="true">
            {leavingDevice !== null && (
              <DeviceSlot
                key={`leaving-${leavingDevice}`}
                device={leavingDevice}
                fit={fit}
                animation={styles.leave}
                onAnimationEnd={() => setLeavingDevice(null)}
              >
                {renderDevice(leavingDevice)}
              </DeviceSlot>
            )}
            <DeviceSlot
              key={shownDevice}
              device={shownDevice}
              fit={fit}
              animation={entering ? styles.enter : undefined}
              onAnimationEnd={() => setEntering(false)}
            >
              {renderDevice(shownDevice)}
            </DeviceSlot>
          </div>

          {SWITCHABLE && shownDevice === 'phone' && (
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
