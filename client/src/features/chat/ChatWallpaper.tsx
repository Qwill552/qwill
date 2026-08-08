import styles from './ChatWallpaper.module.css';

/** Обои чата — буквально строки 282-284 референса «Пульс»: фотография (день/ночь,
 *  переключается темой через data-theme), тёмная виньетка у левого края, фиолетовое
 *  пятно за шапкой. Лежат под лентой и не двигаются вместе с ней. */
export function ChatWallpaper() {
  return (
    <div className={styles.wallpaper} aria-hidden="true">
      <div className={styles.edge} />
      <div className={styles.glow} />
    </div>
  );
}
