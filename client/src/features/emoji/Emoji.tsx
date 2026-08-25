import { memo } from 'react';

import { EMOJI_SHEET_URL, useEmojiIndex } from './emojiIndex';
import styles from './Emoji.module.css';

interface EmojiProps {
  emoji: string;
  size?: number;
  className?: string;
}

export const Emoji = memo(function Emoji({ emoji, size = 20, className }: EmojiProps) {
  const index = useEmojiIndex();
  const entry = index?.byChar.get(emoji);

  if (index === undefined) {
    return (
      <span
        className={`${styles.pending} ${className ?? ''}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label={emoji}
      />
    );
  }

  if (!index || !entry) {
    return (
      <span
        className={`${styles.fallback} ${className ?? ''}`}
        style={{ fontSize: size, width: size, height: size }}
        role="img"
        aria-label={emoji}
      >
        {emoji}
      </span>
    );
  }

  const sheetWidth = index.cols * size;
  const sheetHeight = index.rows * size;

  return (
    <span
      className={`${styles.sprite} ${className ?? ''}`}
      role="img"
      aria-label={entry.k[0] ?? emoji}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${EMOJI_SHEET_URL})`,
        backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
        backgroundPosition: `-${entry.x * size}px -${entry.y * size}px`,
      }}
    />
  );
});
