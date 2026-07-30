import { useEffect, useRef } from 'react';

import styles from './SkyScene.module.css';

const CLOUD_CLASSES = [styles.cloud1, styles.cloud2, styles.cloud3, styles.cloud4, styles.cloud5];

/** Минимальное расстояние (px) между центрами облаков при переразмещении. */
const MIN_DISTANCE = 180;

/**
 * Анимированная сцена дня/ночи с кликабельными "лопающимися" облаками —
 * перенесена из legacy/public/login (секция 5). Работает через прямые правки
 * DOM-стилей в духе исходного clouds.js: облака переставляются много реже,
 * чем реагирует React, так что не стоит гонять это через state/ре-рендер.
 */
export function SkyScene() {
  const cloudRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const clouds = cloudRefs.current.filter((el): el is HTMLDivElement => el !== null);
    if (clouds.length === 0) return;

    const poppingClass = styles.popping!;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    function getValidPosition(current: HTMLDivElement): { top: number; left: number } {
      const others = clouds.filter((c) => c !== current && !c.classList.contains(poppingClass));
      let top = 0;
      let left = 0;
      let attempts = 0;
      let valid = false;

      while (!valid && attempts < 50) {
        top = 5 + Math.random() * 80;
        left = 5 + Math.random() * 80;
        valid = true;

        for (const other of others) {
          const rect = other.getBoundingClientRect();
          const newTopPx = (top / 100) * window.innerHeight;
          const newLeftPx = (left / 100) * window.innerWidth;
          const distance = Math.hypot(rect.top - newTopPx, rect.left - newLeftPx);
          if (distance < MIN_DISTANCE) {
            valid = false;
            break;
          }
        }
        attempts += 1;
      }

      return { top, left };
    }

    function handleClick(cloud: HTMLDivElement) {
      return () => {
        if (cloud.classList.contains(poppingClass)) return;
        cloud.classList.add(poppingClass);

        const timeout = setTimeout(() => {
          const { top, left } = getValidPosition(cloud);
          cloud.style.bottom = 'auto';
          cloud.style.right = 'auto';
          cloud.style.top = `${top}%`;
          cloud.style.left = `${left}%`;
          cloud.style.setProperty('--base-scale', (0.6 + Math.random() * 0.5).toFixed(2));
          cloud.classList.remove(poppingClass);
        }, 400);

        timeouts.push(timeout);
      };
    }

    const cleanups = clouds.map((cloud) => {
      const onClick = handleClick(cloud);
      cloud.addEventListener('click', onClick);
      return () => cloud.removeEventListener('click', onClick);
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className={styles.scene}>
      <div className={styles.stars} />
      <div className={styles.celestial}>
        <div className={styles.sunWrapper}>
          <div className={styles.sunRays}>
            <div className={styles.rayLine} />
            <div className={styles.rayLine} />
            <div className={styles.rayLine} />
            <div className={styles.rayLine} />
          </div>
          <div className={styles.sunDisc} />
        </div>
        <div className={styles.moon} />
      </div>
      {CLOUD_CLASSES.map((cloudClass, index) => (
        <div
          key={index}
          ref={(el) => {
            cloudRefs.current[index] = el;
          }}
          className={`${styles.cloud} ${cloudClass}`}
        />
      ))}
    </div>
  );
}
