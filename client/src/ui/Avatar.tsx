import { useFileSrc } from '../api/useFileSrc';
import styles from './Avatar.module.css';

interface AvatarProps {
  label: string;
  avatarUrl?: string | null;
  size?: number;
  online?: boolean;
  className?: string;
}

/** DTO отдаёт путь вида /api/files/{id} — токен для img нужен по голому id (секция 7). */
function fileIdFromUrl(url: string): string | null {
  return /\/api\/files\/([^/?]+)/.exec(url)?.[1] ?? null;
}

/** Буква-аватар (или картинка, если она есть) с точкой «онлайн».
 *  Размер задаётся вызывающим — метрики в design-system: 54 в списке чатов, 44 в контактах, 40 в шапке. */
export function Avatar({ label, avatarUrl, size = 44, online = false, className }: AvatarProps) {
  const fileId = avatarUrl ? fileIdFromUrl(avatarUrl) : null;
  const src = useFileSrc(fileId);

  return (
    <div className={`${styles.wrap} ${className ?? ''}`} style={{ width: size, height: size }}>
      {src ? (
        <img className={styles.image} src={src} alt="" />
      ) : (
        <div className={styles.circle} style={{ fontSize: size * 0.42 }}>
          {label.charAt(0).toUpperCase()}
        </div>
      )}
      {online && <span className={styles.onlineDot} />}
    </div>
  );
}
