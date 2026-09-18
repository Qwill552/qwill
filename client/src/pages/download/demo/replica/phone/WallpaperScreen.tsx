import { Icon } from '../../../../../ui/Icon';
import { Avatar, ChromeBar, GlassButton, cx } from './Chrome';
import { WALLPAPER_OPTIONS, WALLPAPER_TEXT } from './demoData';
import styles from './WallpaperScreen.module.css';

export function WallpaperScreen() {
  return (
    <div className={styles.screen}>
      <div className={styles.grid}>
        {WALLPAPER_OPTIONS.map((option) => (
          <span key={option.id} className={styles.swatch}>
            <span
              className={cx(
                styles.tile,
                option.kind === 'pattern' && styles.tilePattern,
                option.current && styles.tileCurrent,
              )}
              style={{ background: option.value }}
            >
              {option.current && (
                <span className={styles.check}>
                  <Icon name="check" size={16} />
                </span>
              )}
            </span>
            <span className={styles.swatchLabel}>{option.title}</span>
          </span>
        ))}
      </div>

      <div className={styles.preview}>
        <div className={styles.previewWallpaper} />
        <div className={styles.previewBubbleIn}>{WALLPAPER_TEXT.previewMessages[0]}</div>
        <div className={styles.previewBubbleOut}>{WALLPAPER_TEXT.previewMessages[1]}</div>
      </div>

      <ChromeBar className={styles.header}>
        <GlassButton icon="back" />
        <span className={styles.title}>
          <Avatar label={WALLPAPER_TEXT.previewName} colorKey="grisha" size={28} />
          {WALLPAPER_TEXT.title}
        </span>
      </ChromeBar>
    </div>
  );
}
