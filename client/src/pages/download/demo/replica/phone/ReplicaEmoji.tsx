import { cx } from './Chrome';
import { EMOJI_STRIP, EMOJI_STRIP_URL } from './demoData';
import styles from './ReplicaEmoji.module.css';

interface ReplicaEmojiProps {
  emoji: string;
  size: number;
  className?: string;
}

export function ReplicaEmoji({ emoji, size, className }: ReplicaEmojiProps) {
  const cell = EMOJI_STRIP.indexOf(emoji);

  if (cell < 0) {
    return (
      <span
        className={cx(styles.fallback, className)}
        style={{ width: size, height: size, fontSize: size }}
      >
        {emoji}
      </span>
    );
  }

  return (
    <span
      className={cx(styles.glyph, className)}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${EMOJI_STRIP_URL})`,
        backgroundSize: `${EMOJI_STRIP.length * size}px ${size}px`,
        backgroundPosition: `-${cell * size}px 0`,
      }}
    />
  );
}
