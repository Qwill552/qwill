import { Emoji } from '../emoji/Emoji';
import { useReactionPrefsStore } from '../../stores/reactionPrefsStore';
import { Icon } from '../../ui/Icon';
import styles from './ReactionPicker.module.css';

interface ReactionPickerProps {
  myReactions: ReadonlySet<string>;
  onReact: (emoji: string) => void;
  onExpand: () => void;
}

export function ReactionPicker({ myReactions, onReact, onExpand }: ReactionPickerProps) {
  const quickReactions = useReactionPrefsStore((s) => s.quickReactions);

  return (
    <div className={styles.row} role="group" aria-label="Реакции">
      <div className={`${styles.scroll} hide-native-scrollbar`}>
        {quickReactions.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`${styles.button} ${myReactions.has(emoji) ? styles.mine : ''}`}
            title={`Отреагировать ${emoji}`}
            aria-label={`Отреагировать ${emoji}`}
            onClick={() => onReact(emoji)}
          >
            <Emoji emoji={emoji} size={22} />
          </button>
        ))}
      </div>
      <button type="button" className={styles.expand} onClick={onExpand} aria-label="Больше реакций" title="Больше реакций">
        <Icon name="chevron-down" size={20} />
      </button>
    </div>
  );
}
