import styles from './LiveEllipsis.module.css';

export function LiveEllipsis() {
  return (
    <span aria-hidden="true">
      <span className={`${styles.dot} ${styles.dotFirst}`}>.</span>
      <span className={`${styles.dot} ${styles.dotSecond}`}>.</span>
      <span className={`${styles.dot} ${styles.dotThird}`}>.</span>
    </span>
  );
}
