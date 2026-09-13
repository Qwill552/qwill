import { useEffect, useRef } from 'react';

import { cssDurationMs } from '../../ui/motion';
import styles from './SkyScene.module.css';

const CLOUD_CLASSES = [styles.cloud1, styles.cloud2, styles.cloud3, styles.cloud4, styles.cloud5];

/** Минимальное расстояние (px) между центрами облаков при переразмещении. */
const MIN_DISTANCE = 180;

const CLOUD_CROWN_HEIGHT_ABOVE_BODY = 60;
const MIN_BASE_SCALE = 0.6;
const BASE_SCALE_SPREAD = 0.5;
const PLACEMENT_ATTEMPTS = 50;

interface Spot {
  top: number;
  left: number;
}

/**
 * Анимированная сцена дня/ночи с кликабельными "лопающимися" облаками —
 * перенесена из legacy/public/login (секция 5). Работает через прямые правки
 * DOM-стилей в духе исходного clouds.js: облака переставляются много реже,
 * чем реагирует React, так что не стоит гонять это через state/ре-рендер.
 */
export function SkyScene() {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const cloudRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const scene = sceneRef.current;
    const clouds = cloudRefs.current.filter((el): el is HTMLDivElement => el !== null);
    if (!scene || clouds.length === 0) return;

    const poppingClass = styles.popping!;
    const reformingClass = styles.reforming!;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    function pickInRange(min: number, max: number): number {
      if (max <= min) return (min + max) / 2;
      return min + Math.random() * (max - min);
    }

    const nextSpot = (cloud: HTMLDivElement, scale: number): Spot | null => {
      const sceneRect = scene.getBoundingClientRect();
      if (sceneRect.width < 1 || sceneRect.height < 1) return null;

      const centerX = cloud.offsetWidth / 2;
      const centerY = cloud.offsetHeight / 2;
      const halfWidth = centerX * scale;
      const halfHeight = centerY * scale;
      const halfWithCrown = (centerY + CLOUD_CROWN_HEIGHT_ABOVE_BODY) * scale;

      const minLeft = halfWidth - centerX;
      const maxLeft = sceneRect.width - centerX - halfWidth;
      const minTop = halfWithCrown - centerY;
      const maxTop = sceneRect.height - centerY - halfHeight;

      const takenCenters = clouds
        .filter((other) => other !== cloud && !other.classList.contains(poppingClass))
        .map((other) => {
          const rect = other.getBoundingClientRect();
          return {
            x: rect.left - sceneRect.left + rect.width / 2,
            y: rect.top - sceneRect.top + rect.height / 2,
          };
        });

      let left = pickInRange(minLeft, maxLeft);
      let top = pickInRange(minTop, maxTop);

      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
        left = pickInRange(minLeft, maxLeft);
        top = pickInRange(minTop, maxTop);
        const x = left + centerX;
        const y = top + centerY;
        const clear = takenCenters.every(
          (center) => Math.hypot(center.x - x, center.y - y) >= MIN_DISTANCE,
        );
        if (clear) break;
      }

      return { top: (top / sceneRect.height) * 100, left: (left / sceneRect.width) * 100 };
    };

    function handleClick(cloud: HTMLDivElement) {
      return () => {
        if (cloud.classList.contains(poppingClass)) return;
        cloud.classList.remove(reformingClass);
        cloud.classList.add(poppingClass);

        const popMs = cssDurationMs('--dur-cloud-pop');
        const timeout = setTimeout(() => {
          const scale = Number((MIN_BASE_SCALE + Math.random() * BASE_SCALE_SPREAD).toFixed(2));
          const spot = nextSpot(cloud, scale);
          if (spot) {
            cloud.style.bottom = 'auto';
            cloud.style.right = 'auto';
            cloud.style.top = `${spot.top}%`;
            cloud.style.left = `${spot.left}%`;
            cloud.style.setProperty('--base-scale', String(scale));
          }
          cloud.classList.remove(poppingClass);
          cloud.classList.add(reformingClass);
          timeouts.push(setTimeout(() => cloud.classList.remove(reformingClass), popMs));
        }, popMs);

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
    <div className={styles.scene} ref={sceneRef} data-theme-motion>
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
          aria-hidden="true"
          ref={(el) => {
            cloudRefs.current[index] = el;
          }}
          className={`${styles.cloud} ${cloudClass}`}
        />
      ))}
    </div>
  );
}
