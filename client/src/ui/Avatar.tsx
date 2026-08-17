import type { AvatarColor } from '@messenger/shared';

import { useFileSrc } from '../api/useFileSrc';
import { avatarGradientFor, avatarGradientForColor } from './tint';
import styles from './Avatar.module.css';

interface AvatarProps {
  label: string;
  avatarUrl?: string | null;
  size?: number;
  online?: boolean;
  /** Персональный цвет — заводится один раз на сервере при регистрации (shared/src/user.ts,
   *  AVATAR_COLOR_VALUES) и приходит вместе с DTO пользователя. Передавайте его для любой
   *  сущности, которая представляет человека (собеседник, участник, отправитель, свой профиль):
   *  так один и тот же человек красится одинаково везде, а не по-разному в зависимости от
   *  того, что оказалось под рукой у вызывающего экрана. */
  color?: AvatarColor;
  /** Хеш-фолбэк для сущностей без персонального цвета — чат/группа как таковые не «люди»,
   *  им AvatarColor не положен. По умолчанию хешируется сама подпись; передавайте `chat.id`,
   *  если у двух чатов может совпасть заголовок. Игнорируется, если задан `color`. */
  colorKey?: string;
  /** Буквально из референса: тень есть только у аватара в списке чатов
   *  (0 8px 20px -10px rgba(0,0,0,.9)) — у остальных размеров её нет. */
  shadow?: boolean;
  /** Готовая картинка вместо файла из хранилища — логотип сервисного аккаунта Qwill. Он не
   *  загружался как File и живёт статикой (`/icon-192.png`, тот же значок, что у установленного
   *  приложения), поэтому мимо useFileSrc. Перебивает avatarUrl. */
  imageSrc?: string;
  className?: string;
}

/** DTO отдаёт путь вида /api/files/{id} — токен для img нужен по голому id (секция 7). */
function fileIdFromUrl(url: string): string | null {
  return /\/api\/files\/([^/?]+)/.exec(url)?.[1] ?? null;
}

/** Буква-аватар (или картинка, если она есть) с точкой «онлайн».
 *  Размер задаётся вызывающим — метрики в design-system: 54 в списке чатов, 44 в контактах, 40 в шапке. */
export function Avatar({
  label,
  avatarUrl,
  size = 44,
  online = false,
  color,
  colorKey,
  shadow,
  imageSrc,
  className,
}: AvatarProps) {
  const fileId = avatarUrl ? fileIdFromUrl(avatarUrl) : null;
  const fileSrc = useFileSrc(fileId, 'thumb');
  const src = imageSrc ?? fileSrc;

  return (
    <div className={`${styles.wrap} ${className ?? ''}`} style={{ width: size, height: size }}>
      {src ? (
        <img className={styles.image} src={src} alt="" />
      ) : (
        <div
          className={`${styles.circle} ${shadow ? styles.shadow : ''}`}
          style={{
            fontSize: size * 0.35,
            ['--avatar-gradient' as string]: color
              ? avatarGradientForColor(color)
              : avatarGradientFor(colorKey ?? label),
          }}
        >
          {label.charAt(0).toUpperCase()}
        </div>
      )}
      {online && <span className={styles.onlineDot} />}
    </div>
  );
}
