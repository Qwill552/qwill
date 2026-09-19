import { Icon, type IconName } from '../../../../../ui/Icon';
import { cx } from '../phone/Chrome';
import styles from './Chrome.module.css';

interface IconBtnProps {
  icon: IconName;
  size?: number;
  className?: string;
}

export function IconBtn({ icon, size = 18, className }: IconBtnProps) {
  return (
    <span className={cx(styles.iconBtn, className)}>
      <Icon name={icon} size={size} />
    </span>
  );
}

export function Fab() {
  return (
    <span className={styles.fab}>
      <Icon name="plus" size={22} />
    </span>
  );
}

interface CursorProps {
  top: number;
  left: number;
}

export function Cursor({ top, left }: CursorProps) {
  return (
    <svg
      className={styles.cursor}
      style={{ top, left }}
      width="20"
      height="24"
      viewBox="0 0 20 24"
      aria-hidden="true"
    >
      <path
        d="M1.5 1.2 17.8 15.4l-6.9.6 3.6 7.4-3 1.4-3.6-7.4-4.7 4.9Z"
        fill="var(--replica-cursor-fill)"
        stroke="var(--replica-cursor-stroke)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
