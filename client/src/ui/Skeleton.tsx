import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  /** Круглый — для места под аватар. */
  circle?: boolean;
  className?: string;
}

/** Заглушка на месте ещё не приехавшего содержимого. Держит те же размеры, что и реальный
 *  элемент, — иначе при загрузке layout прыгнет. */
export function Skeleton({ width = '100%', height = 16, circle, className }: SkeletonProps) {
  return (
    <span
      className={`${styles.skeleton} ${circle ? styles.circle : ''} ${className ?? ''}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
