import type { CSSProperties } from 'react';

import { useWallpaperStore } from '../../stores/wallpaperStore';
import { wallpaperGradientValue } from './wallpaperGradients';
import { wallpaperPatternById } from './wallpaperPatterns';
import styles from './ChatWallpaper.module.css';

/** Обои чата — градиент из UI-кита Telegram и векторный узор поверх него мягким наложением.
 *  Лежат под лентой и не двигаются вместе с ней. */
export function ChatWallpaper() {
  const gradientId = useWallpaperStore((s) => s.gradientId);
  const patternId = useWallpaperStore((s) => s.patternId);
  const pattern = wallpaperPatternById(patternId);

  const style = {
    '--chat-gradient': wallpaperGradientValue(gradientId),
    '--chat-pattern-src': `url('${pattern.src}')`,
  } as CSSProperties;

  return (
    <div className={styles.wallpaper} style={style} aria-hidden="true">
      <div className={styles.pattern} />
    </div>
  );
}
