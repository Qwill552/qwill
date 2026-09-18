import type { ReactNode } from 'react';

import {
  PHONE_BEZEL,
  PHONE_BODY,
  PHONE_BUTTONS,
  PHONE_EDGE_WIDTH,
  PHONE_PUNCH_HOLE,
  PHONE_RADIUS_BEZEL,
  PHONE_RADIUS_BODY,
  PHONE_RADIUS_SCREEN,
  PHONE_SCREEN_FONT_SIZE,
} from '../config';
import styles from './PhoneShell.module.css';

interface PhoneShellProps {
  children: ReactNode;
}

export function PhoneShell({ children }: PhoneShellProps) {
  return (
    <div
      className={styles.phone}
      style={{
        ['--phone-body-width' as string]: `${PHONE_BODY.width}px`,
        ['--phone-body-height' as string]: `${PHONE_BODY.height}px`,
        ['--phone-bezel-metal' as string]: `${PHONE_BEZEL.metal}px`,
        ['--phone-bezel-black' as string]: `${PHONE_BEZEL.black}px`,
        ['--phone-radius-body' as string]: `${PHONE_RADIUS_BODY}px`,
        ['--phone-radius-bezel' as string]: `${PHONE_RADIUS_BEZEL}px`,
        ['--phone-radius-screen' as string]: `${PHONE_RADIUS_SCREEN}px`,
        ['--phone-edge-width' as string]: `${PHONE_EDGE_WIDTH}px`,
        ['--phone-punch-size' as string]: `${PHONE_PUNCH_HOLE.size}px`,
        ['--phone-punch-top' as string]: `${PHONE_PUNCH_HOLE.top}px`,
        ['--phone-button-protrusion' as string]: `${PHONE_BUTTONS.protrusion}px`,
        ['--phone-button-radius' as string]: `${PHONE_BUTTONS.radius}px`,
        ['--phone-power-top' as string]: `${PHONE_BUTTONS.power.top}px`,
        ['--phone-power-height' as string]: `${PHONE_BUTTONS.power.height}px`,
        ['--phone-volume-top' as string]: `${PHONE_BUTTONS.volume.top}px`,
        ['--phone-volume-height' as string]: `${PHONE_BUTTONS.volume.height}px`,
        ['--phone-screen-font-size' as string]: `${PHONE_SCREEN_FONT_SIZE}px`,
      }}
    >
      <span className={styles.shadow} />
      <span className={styles.power} />
      <span className={styles.volume} />
      <div className={styles.body}>
        <div className={styles.bezel}>
          <div className={styles.screen}>
            <div className={styles.screenContent}>{children}</div>
            <span className={styles.punch} />
            <span className={styles.glare} />
          </div>
        </div>
        <span className={styles.edge} />
      </div>
    </div>
  );
}
