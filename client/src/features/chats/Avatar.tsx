import styles from './Avatar.module.css';

interface AvatarProps {
  label: string;
  size?: number;
  online?: boolean;
}

/** Буква-аватар с точкой «онлайн» — переиспользуется в списке чатов и шапке (секция 5: крупнее, чем в Telegram). */
export function Avatar({ label, size = 44, online = false }: AvatarProps) {
  return (
    <div className={styles.wrap} style={{ width: size, height: size }}>
      <div className={styles.circle} style={{ fontSize: size * 0.42 }}>
        {label.charAt(0).toUpperCase()}
      </div>
      {online && <span className={styles.onlineDot} />}
    </div>
  );
}
