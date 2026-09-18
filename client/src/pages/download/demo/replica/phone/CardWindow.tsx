import { CARD_BUBBLE_TEXT, CARD_PALETTE, CARD_SPRITE, CARD_SPRITE_COLS } from './demoData';
import styles from './CardWindow.module.css';

export function CardWindow() {
  return (
    <div className={styles.frame}>
      <div className={styles.window}>
        <span className={styles.bubble}>{CARD_BUBBLE_TEXT}</span>
        <div
          className={styles.sprite}
          style={{ gridTemplateColumns: `repeat(${CARD_SPRITE_COLS}, 1fr)` }}
        >
          {CARD_SPRITE.flatMap((row, rowIndex) =>
            row.split('').map((char, colIndex) => {
              const color = CARD_PALETTE[char];
              return (
                <span
                  key={`${rowIndex}-${colIndex}`}
                  className={styles.cell}
                  style={color ? { background: color } : undefined}
                />
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
