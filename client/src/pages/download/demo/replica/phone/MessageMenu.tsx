import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { Icon } from '../../../../../ui/Icon';
import { Bubble } from './Bubble';
import { cx } from './Chrome';
import {
  MENU_EDGE,
  MENU_FALLBACK_ANCHOR,
  MENU_GAP,
  MESSAGE_MENU_ITEMS,
  QUICK_REACTIONS,
  type MenuAnchor,
  type ReplicaMessage,
} from './demoData';
import styles from './MessageMenu.module.css';

interface MessageMenuProps {
  message: ReplicaMessage;
  rootRef: RefObject<HTMLElement | null>;
  open: boolean;
  picked: string | null;
}

function measureAnchor(root: HTMLElement, messageId: string, panelHeight: number): MenuAnchor | null {
  const bubble = root.querySelector(`[data-demo-message="${messageId}"]`);
  if (!(bubble instanceof HTMLElement)) return null;

  const scale = root.offsetHeight > 0 ? root.getBoundingClientRect().height / root.offsetHeight : 1;
  const rootBox = root.getBoundingClientRect();
  const box = bubble.getBoundingClientRect();
  const top = (box.top - rootBox.top) / scale;
  const height = box.height / scale;
  const below = root.offsetHeight - (top + height);

  return {
    top,
    left: (box.left - rootBox.left) / scale,
    height,
    dropUp: below < panelHeight + MENU_GAP + MENU_EDGE,
  };
}

export function MessageMenu({ message, rootRef, open, picked }: MessageMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;
    setAnchor(measureAnchor(root, message.id, panel.offsetHeight) ?? MENU_FALLBACK_ANCHOR);
  }, [message.id, rootRef]);

  return (
    <div className={cx(styles.layer, open && anchor !== null && styles.layerOpen)}>
      <div className={styles.scrim} />

      <div
        className={cx(styles.stack, anchor?.dropUp && styles.stackUp, anchor === null && styles.stackBlind)}
        style={anchor ? { top: anchor.dropUp ? anchor.top + anchor.height : anchor.top, left: anchor.left } : undefined}
      >
        <div className={styles.clone}>
          <Bubble message={message} />
        </div>

        <div className={styles.panel} ref={panelRef}>
          <div className={styles.reactions}>
            <div className={styles.reactionScroll}>
              {QUICK_REACTIONS.map((emoji) => (
                <span
                  key={emoji}
                  className={cx(styles.reactionButton, emoji === picked && styles.reactionPicked)}
                >
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
