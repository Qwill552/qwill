import type { ButtonHTMLAttributes } from 'react';

import { Icon, type IconName } from '../Icon';
import { Ripple } from '../Ripple';
import styles from './GlassButton.module.css';

type Variant = 'default' | 'primary' | 'danger';

const VARIANT_CLASS: Record<Variant, string | undefined> = {
  default: '',
  primary: styles.primary,
  danger: styles.danger,
};

interface GlassButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Обязателен: у кнопки-иконки нет текста, и без него она немая для скринридера. */
  label: string;
  variant?: Variant;
  size?: number;
}

/** Круглый кусок хромы. От `IconButton` отличается тем, что несёт на себе стекло:
 *  внутри `ChromeBar` заливку держат куски, а не полоса. */
export function GlassButton({
  icon,
  label,
  variant = 'default',
  size = 22,
  className,
  ...rest
}: GlassButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.button} ${VARIANT_CLASS[variant]} ${className ?? ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size} className={styles.glyph} />
      <Ripple />
    </button>
  );
}
