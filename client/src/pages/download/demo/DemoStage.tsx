import { useLayoutEffect, useRef, useState } from 'react';

import { DEMO_SCALE, PHONE_BODY, SCENARIO_SWITCH } from '../config';
import { PhoneShell } from '../devices/PhoneShell';
import { createDemoStore } from './engine/store';
import { PhoneDemo } from './PhoneDemo';
import styles from './DemoStage.module.css';
import { ScenarioSwitch } from './ScenarioSwitch';
import { EVERYDAY_SCENARIO } from './scenarios/everyday';

const SCENARIOS = [EVERYDAY_SCENARIO];

const store = createDemoStore(SCENARIOS[0]!);

const SWITCHABLE = SCENARIOS.length > 1;

const RESERVED_WIDTH = SWITCHABLE ? SCENARIO_SWITCH.buttonSize + SCENARIO_SWITCH.gap : 0;

function fitScale(hostWidth: number, viewportHeight: number): number {
  const byWidth = (hostWidth - RESERVED_WIDTH * 2) / PHONE_BODY.width;
  const byHeight = (viewportHeight * DEMO_SCALE.heightRatio) / PHONE_BODY.height;
  const fit = Math.min(byWidth, byHeight, DEMO_SCALE.max);
  return Math.max(Math.round(fit * 1000) / 1000, DEMO_SCALE.min);
}

type ScrimPhase = 'idle' | 'toDark' | 'toClear';

export function DemoStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(DEMO_SCALE.min);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [scrimPhase, setScrimPhase] = useState<ScrimPhase>('idle');

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = document.documentElement;
    const update = () => setScale(fitScale(host.clientWidth, root.clientHeight));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

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

  return (
    <div ref={hostRef} className={styles.host}>
      <div className={styles.frame}>
        <div
          className={styles.stage}
          style={{
            ['--demo-scale' as string]: scale,
            ['--demo-body-width' as string]: `${PHONE_BODY.width}px`,
            ['--demo-body-height' as string]: `${PHONE_BODY.height}px`,
          }}
          aria-hidden="true"
        >
          <div className={styles.scaled}>
            <PhoneShell>
              <PhoneDemo
                store={store}
                scenarioScrimLit={scrimPhase === 'toDark'}
                onScenarioScrimTransitionEnd={handleScrimTransitionEnd}
              />
            </PhoneShell>
          </div>
        </div>

        {SWITCHABLE && (
          <ScenarioSwitch
            activeIndex={scenarioIndex}
            count={SCENARIOS.length}
            disabled={scrimPhase !== 'idle'}
            onSwitch={handleSwitch}
          />
        )}
      </div>
    </div>
  );
}
