import type { ReactNode } from 'react';

import { Ripple } from '../Ripple';
import styles from './GlassPill.module.css';

type SubtitleTone = 'default' | 'online' | 'accent';
type Variant = 'default' | 'cap';

const TONE_CLASS: Record<SubtitleTone, string | undefined> = {
  default: '',
  online: styles.subtitleOnline,
  accent: styles.subtitleAccent,
};

interface GlassPillProps {
  title: ReactNode;
  subtitle?: ReactNode;
  subtitleTone?: SubtitleTone;
  /** `cap` — буквально капсула имени собеседника в шапке чата (строка 300 референса):
   *  фиолетовый градиент `--pulse-cap` вместо нейтрального стекла, крупнее заголовок. */
  variant?: Variant;
  /** Аватар или иконка слева от текста. */
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

/** Растяжимая капсула хромы: название чата со статусом, заголовок экрана-заглушки.
 *  Тап по ней — переход к информации о чате, поэтому по умолчанию это кнопка. */
export function GlassPill({
  title,
  subtitle,
  subtitleTone = 'default',
  variant = 'default',
  leading,
  trailing,
  onClick,
  disabled,
  className,
}: GlassPillProps) {
  const variantClass = variant === 'cap' ? styles.cap : '';

  const body = (
    <>
      {leading}
      <span className={styles.text}>
        <span className={`${styles.title} ${variant === 'cap' ? styles.capTitle : ''}`}>{title}</span>
        {subtitle != null && (
          <span
            className={`${styles.subtitle} ${variant === 'cap' ? styles.capSubtitle : ''} ${TONE_CLASS[subtitleTone]}`}
          >
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
    </>
  );

  if (!onClick) {
    return <div className={`${styles.pill} ${variantClass} ${className ?? ''}`}>{body}</div>;
  }

  return (
    <button
      type="button"
      className={`${styles.pill} ${variantClass} ${styles.interactive} ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {body}
      {!disabled && <Ripple />}
    </button>
  );
}
