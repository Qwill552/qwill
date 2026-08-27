import type { ReactNode } from 'react';

import { Ripple } from '../Ripple';
import styles from './GlassPill.module.css';

type SubtitleTone = 'default' | 'online' | 'accent';
type Variant = 'default' | 'cap' | 'flat';

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
  /** Аватар — отдельная кнопка (просмотр фото), не часть перехода в профиль/группу. Вложенный
   *  `<button>` внутри `onClick`-капсулы невалиден, поэтому при заданном onLeadingClick `leading`
   *  выносится в свою кнопку рядом, а не внутрь общей. */
  onLeadingClick?: () => void;
  leadingLabel?: string;
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
  onLeadingClick,
  leadingLabel,
  disabled,
  className,
}: GlassPillProps) {
  const variantClass = variant === 'cap' ? styles.cap : variant === 'flat' ? styles.flat : '';
  const titleVariantClass = variant === 'cap' ? styles.capTitle : variant === 'flat' ? styles.flatTitle : '';
  const subtitleVariantClass = variant === 'cap' ? styles.capSubtitle : variant === 'flat' ? styles.flatSubtitle : '';

  const text = (
    <span className={styles.text}>
      <span className={`${styles.title} ${titleVariantClass}`}>{title}</span>
      {subtitle != null && (
        <span className={`${styles.subtitle} ${subtitleVariantClass} ${TONE_CLASS[subtitleTone]}`}>{subtitle}</span>
      )}
    </span>
  );

  if (onLeadingClick) {
    return (
      <div className={`${styles.pill} ${variantClass} ${className ?? ''}`}>
        <button type="button" className={styles.leadingButton} onClick={onLeadingClick} aria-label={leadingLabel}>
          {leading}
        </button>
        {onClick ? (
          <button type="button" className={styles.textButton} onClick={onClick} disabled={disabled}>
            {text}
            {trailing}
            {!disabled && <Ripple />}
          </button>
        ) : (
          <div className={styles.textButton}>
            {text}
            {trailing}
          </div>
        )}
      </div>
    );
  }

  const body = (
    <>
      {leading}
      {text}
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
