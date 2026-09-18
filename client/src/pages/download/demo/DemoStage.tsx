import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { DEMO_SCALE, PHONE_BODY } from '../config';
import { PhoneShell } from '../devices/PhoneShell';
import styles from './DemoStage.module.css';

interface DemoStageProps {
  children: ReactNode;
}

function fitScale(hostWidth: number, viewportHeight: number): number {
  const byWidth = hostWidth / PHONE_BODY.width;
  const byHeight = (viewportHeight * DEMO_SCALE.heightRatio) / PHONE_BODY.height;
  const fit = Math.min(byWidth, byHeight, DEMO_SCALE.max);
  return Math.max(Math.round(fit * 1000) / 1000, DEMO_SCALE.min);
}

export function DemoStage({ children }: DemoStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(DEMO_SCALE.min);

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

  return (
    <div ref={hostRef} className={styles.host}>
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
          <PhoneShell>{children}</PhoneShell>
        </div>
      </div>
    </div>
  );
}
