import { Icon, type IconName } from '../../../../../ui/Icon';
import { LAPTOP_CURSOR_SIZE } from '../../../config';
import type { DemoReadout } from '../../engine/store';
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
  pointer?: DemoReadout;
  down?: boolean;
  hidden?: boolean;
}

export function Cursor({ pointer, down, hidden }: CursorProps) {
  return (
    <span
      ref={pointer}
      className={cx(styles.cursor, hidden && styles.cursorAway)}
      aria-hidden="true"
    >
      <svg
        className={cx(styles.arrow, down && styles.arrowDown)}
        width={LAPTOP_CURSOR_SIZE.width}
        height={LAPTOP_CURSOR_SIZE.height}
        viewBox="0 0 20 24"
      >
        <path
          d="M1.5 1.2 17.8 15.4l-6.9.6 3.6 7.4-3 1.4-3.6-7.4-4.7 4.9Z"
          fill="var(--replica-cursor-fill)"
          stroke="var(--replica-cursor-stroke)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
