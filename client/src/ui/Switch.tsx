import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Подпись для скринридера; если рядом есть видимый текст — можно передать его id через labelledBy. */
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, labelledBy, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.track} />
      <span className={styles.thumb} />
    </button>
  );
}
