import { Icon } from '../../../../../ui/Icon';
import { Bubble } from './Bubble';
import { cx } from './Chrome';
import { MESSAGE_MENU_ITEMS, QUICK_REACTIONS, type ReplicaMessage } from './demoData';
import styles from './MessageMenu.module.css';

interface MessageMenuProps {
  message: ReplicaMessage;
  top: number;
  left: number;
}

export function MessageMenu({ message, top, left }: MessageMenuProps) {
  return (
    <div className={styles.layer}>
      <div className={styles.scrim} />

      <div className={styles.stack} style={{ top, left }}>
        <div className={styles.clone}>
          <Bubble message={message} />
        </div>

        <div className={styles.panel}>
          <div className={styles.reactions}>
            <div className={styles.reactionScroll}>
              {QUICK_REACTIONS.map((emoji) => (
                <span key={emoji} className={styles.reactionButton}>
                  {emoji}
                </span>
              ))}
            </div>
            <span className={styles.reactionExpand}>
              <Icon name="chevron-down" size={20} />
            </span>
          </div>

          <div className={styles.list}>
            {MESSAGE_MENU_ITEMS.map((item) => (
              <span key={item.id} className={cx(styles.item, item.id === 'delete' && styles.itemDanger)}>
                <Icon name={item.icon} size={22} className={styles.glyph} />
                <span className={styles.label}>{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
