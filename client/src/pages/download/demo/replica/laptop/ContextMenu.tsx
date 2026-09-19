import { Icon } from '../../../../../ui/Icon';
import { cx } from '../phone/Chrome';
import { MESSAGE_MENU_ITEMS, QUICK_REACTIONS, REPLICA_EMOJI_SIZE } from '../phone/demoData';
import { ReplicaEmoji } from '../phone/ReplicaEmoji';
import { Cursor } from './Chrome';
import styles from './ContextMenu.module.css';

interface ContextMenuProps {
  picked: string | null;
  top: number;
  left: number;
}

export function ContextMenu({ picked, top, left }: ContextMenuProps) {
  return (
    <>
      <div className={styles.panel} style={{ top, left }}>
        <div className={styles.reactions}>
          {QUICK_REACTIONS.map((emoji) => (
            <span key={emoji} className={cx(styles.reactionButton, emoji === picked && styles.reactionPicked)}>
              <ReplicaEmoji emoji={emoji} size={REPLICA_EMOJI_SIZE.menu} />
            </span>
          ))}
        </div>

        <div className={styles.list}>
          {MESSAGE_MENU_ITEMS.map((item) => (
            <span key={item.id} className={cx(styles.item, item.id === 'delete' && styles.itemDanger)}>
              <Icon name={item.icon} size={18} className={styles.glyph} />
              <span className={styles.label}>{item.label}</span>
            </span>
          ))}
        </div>
      </div>

      <Cursor top={top - 4} left={left - 6} />
    </>
  );
}
