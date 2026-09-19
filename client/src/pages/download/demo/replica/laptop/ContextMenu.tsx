import { Icon } from '../../../../../ui/Icon';
import { LAPTOP_MENU, laptopMenuOrigin } from '../../../config';
import { cx } from '../phone/Chrome';
import { MESSAGE_MENU_ITEMS, QUICK_REACTIONS, REPLICA_EMOJI_SIZE } from '../phone/demoData';
import { ReplicaEmoji } from '../phone/ReplicaEmoji';
import styles from './ContextMenu.module.css';

interface ContextMenuProps {
  picked: string | null;
  x: number;
  y: number;
}

export function ContextMenu({ picked, x, y }: ContextMenuProps) {
  const origin = laptopMenuOrigin(x, y);

  return (
    <div
      className={styles.panel}
      style={{
        top: origin.top,
        left: origin.left,
        width: LAPTOP_MENU.width,
        ['--menu-pad-x' as string]: `${LAPTOP_MENU.padX}px`,
        ['--menu-pad-y' as string]: `${LAPTOP_MENU.reactionPadY}px`,
        ['--menu-reaction-size' as string]: `${LAPTOP_MENU.reactionSize}px`,
        ['--menu-item-height' as string]: `${LAPTOP_MENU.itemHeight}px`,
        ['--menu-list-pad' as string]: `${LAPTOP_MENU.listPad}px`,
      }}
    >
      <div className={styles.reactions}>
        {QUICK_REACTIONS.map((emoji) => (
          <span
            key={emoji}
            className={cx(styles.reactionButton, emoji === picked && styles.reactionPicked)}
          >
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
  );
}
