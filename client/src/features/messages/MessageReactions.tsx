import type { MessageReactionDto } from '@messenger/shared';

import styles from './MessageReactions.module.css';

export function MessageReactions({
  reactions,
  myId,
  onToggle,
}: {
  reactions: MessageReactionDto[];
  myId: string | null;
  onToggle: (emoji: string) => void;
}) {
  if (reactions.length === 0) return null;

  function stopPointerBubble(event: React.PointerEvent): void {
    event.stopPropagation();
  }

  return (
    <div className={styles.row}>
      {reactions.map((reaction) => {
        const mine = !!myId && reaction.userIds.includes(myId);
        const label = `${reaction.emoji} — ${mine ? 'убрать вашу реакцию' : 'поставить реакцию'} (${reaction.userIds.length})`;
        return (
          <button
            key={reaction.emoji}
            type="button"
            className={`${styles.pill} ${mine ? styles.pillMine : ''}`}
            title={label}
            aria-label={label}
            onPointerDown={stopPointerBubble}
            onPointerMove={stopPointerBubble}
            onPointerUp={stopPointerBubble}
            onPointerCancel={stopPointerBubble}
            onClick={() => onToggle(reaction.emoji)}
          >
            <span>{reaction.emoji}</span>
            <span className={styles.count}>{reaction.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}
