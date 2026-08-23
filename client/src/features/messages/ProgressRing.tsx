import styles from './ProgressRing.module.css';

const RING_RADIUS = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ProgressRing({ progress }: { progress: number }) {
  return (
    <svg className={styles.ring} viewBox="0 0 36 36" aria-hidden="true">
      <circle className={styles.track} cx="18" cy="18" r={RING_RADIUS} />
      <circle
        className={styles.fill}
        cx="18"
        cy="18"
        r={RING_RADIUS}
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
      />
    </svg>
  );
}
