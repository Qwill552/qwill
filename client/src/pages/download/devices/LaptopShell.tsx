import type { ReactNode } from 'react';

import {
  LAPTOP_BASE,
  LAPTOP_BEZEL,
  LAPTOP_BODY,
  LAPTOP_EDGE_WIDTH,
  LAPTOP_FINGER_NOTCH,
  LAPTOP_KEYS,
  LAPTOP_LID,
  LAPTOP_RADIUS_BEZEL,
  LAPTOP_RADIUS_LID,
  LAPTOP_RADIUS_SCREEN,
  LAPTOP_SCREEN_FONT_SIZE,
  LAPTOP_SHADOW,
  LAPTOP_TRACKPAD,
} from '../config';
import styles from './LaptopShell.module.css';

interface LaptopShellProps {
  children: ReactNode;
}

export function LaptopShell({ children }: LaptopShellProps) {
  return (
    <div
      className={styles.laptop}
      style={{
        ['--laptop-body-width' as string]: `${LAPTOP_BODY.width}px`,
        ['--laptop-body-height' as string]: `${LAPTOP_BODY.height}px`,
        ['--laptop-lid-width' as string]: `${LAPTOP_LID.width}px`,
        ['--laptop-lid-height' as string]: `${LAPTOP_LID.height}px`,
        ['--laptop-bezel-metal' as string]: `${LAPTOP_BEZEL.metal}px`,
        ['--laptop-bezel-black' as string]: `${LAPTOP_BEZEL.black}px`,
        ['--laptop-radius-lid' as string]: `${LAPTOP_RADIUS_LID}px`,
        ['--laptop-radius-bezel' as string]: `${LAPTOP_RADIUS_BEZEL}px`,
        ['--laptop-radius-screen' as string]: `${LAPTOP_RADIUS_SCREEN}px`,
        ['--laptop-edge-width' as string]: `${LAPTOP_EDGE_WIDTH}px`,
        ['--laptop-base-width' as string]: `${LAPTOP_BASE.width}px`,
        ['--laptop-base-depth' as string]: `${LAPTOP_BASE.depth}px`,
        ['--laptop-base-radius' as string]: `${LAPTOP_BASE.radius}px`,
        ['--laptop-base-visible-depth' as string]: `${LAPTOP_BASE.visibleDepth}px`,
        ['--laptop-perspective' as string]: `${LAPTOP_BASE.perspective}px`,
        ['--laptop-tilt' as string]: `${LAPTOP_BASE.tiltDeg}deg`,
        ['--laptop-front-width' as string]: `${LAPTOP_BASE.frontWidth}px`,
        ['--laptop-front-height' as string]: `${LAPTOP_BASE.frontHeight}px`,
        ['--laptop-front-radius' as string]: `${LAPTOP_BASE.frontRadius}px`,
        ['--laptop-finger-width' as string]: `${LAPTOP_FINGER_NOTCH.width}px`,
        ['--laptop-finger-height' as string]: `${LAPTOP_FINGER_NOTCH.height}px`,
        ['--laptop-keys-inset' as string]: `${LAPTOP_KEYS.inset}px`,
        ['--laptop-keys-top' as string]: `${LAPTOP_KEYS.top}px`,
        ['--laptop-keys-height' as string]: `${LAPTOP_KEYS.height}px`,
        ['--laptop-keys-radius' as string]: `${LAPTOP_KEYS.radius}px`,
        ['--laptop-keys-padding' as string]: `${LAPTOP_KEYS.padding}px`,
        ['--laptop-key-pitch-x' as string]: `${LAPTOP_KEYS.pitchX}px`,
        ['--laptop-key-pitch-y' as string]: `${LAPTOP_KEYS.pitchY}px`,
        ['--laptop-key-gap' as string]: `${LAPTOP_KEYS.gap}px`,
        ['--laptop-key-feather' as string]: `${LAPTOP_KEYS.feather}px`,
        ['--laptop-trackpad-width' as string]: `${LAPTOP_TRACKPAD.width}px`,
        ['--laptop-trackpad-height' as string]: `${LAPTOP_TRACKPAD.height}px`,
        ['--laptop-trackpad-top' as string]: `${LAPTOP_TRACKPAD.top}px`,
        ['--laptop-trackpad-radius' as string]: `${LAPTOP_TRACKPAD.radius}px`,
        ['--laptop-shadow-width' as string]: `${LAPTOP_SHADOW.width}px`,
        ['--laptop-shadow-height' as string]: `${LAPTOP_SHADOW.height}px`,
        ['--laptop-screen-font-size' as string]: `${LAPTOP_SCREEN_FONT_SIZE}px`,
      }}
    >
      <span className={styles.shadow} />
      <div className={styles.base}>
        <span className={styles.well}>
          <span className={styles.keys} />
        </span>
        <span className={styles.trackpad} />
      </div>
      <span className={styles.front}>
        <span className={styles.finger} />
      </span>
      <div className={styles.lid}>
        <div className={styles.bezel}>
          <div className={styles.screen}>
            <div className={styles.screenContent}>{children}</div>
            <span className={styles.glare} />
          </div>
          <span className={styles.bezelRing} />
        </div>
        <span className={styles.edge} />
      </div>
    </div>
  );
}
