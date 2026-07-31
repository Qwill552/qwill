import type { ButtonHTMLAttributes } from 'react';

import { Icon, type IconName } from './Icon';
import { Ripple } from './Ripple';
import styles from './IconButton.module.css';

type Variant = 'default' | 'plain' | 'primary' | 'danger';

const VARIANT_CLASS: Record<Variant, string | undefined> = {
  default: '',
  plain: styles.plain,
  primary: styles.primary,
  danger: styles.danger,
};

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Обязателен: у кнопки-иконки нет текста, и без него она немая для скринридера. */
  label: string;
  variant?: Variant;
  size?: number;
}

/** Кнопка-иконка: тап-цель 44×44, фокус-кольцо, ripple. Единственный способ поставить иконку,
 *  по которой можно нажать, — иначе тап-цели и фокус разойдутся по экранам. */
export function IconButton({
  icon,
  label,
  variant = 'default',
  size = 24,
  className,
  ...rest
}: IconButtonProps) {
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
