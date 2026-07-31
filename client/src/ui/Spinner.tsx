import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: number;
  className?: string;
  /** Подпись для скринридера; по умолчанию спиннер декоративен. */
  label?: string;
}

export function Spinner({ size = 24, className, label }: SpinnerProps) {
  return (
    <svg
      className={`${styles.spinner} ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      <circle className={styles.track} cx="12" cy="12" r="9" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}
