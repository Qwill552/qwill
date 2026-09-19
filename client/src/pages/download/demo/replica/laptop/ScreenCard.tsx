import type { ReactNode } from 'react';

import { Icon } from '../../../../../ui/Icon';
import { cx } from '../phone/Chrome';
import styles from './ScreenCard.module.css';

type ScreenCardWidth = 'default' | 'wide' | 'compact';

interface ScreenCardProps {
  title?: string;
  width?: ScreenCardWidth;
  chromeless?: boolean;
  children: ReactNode;
}

export function ScreenCard({ title, width = 'default', chromeless, children }: ScreenCardProps) {
  return (
    <div className={styles.scrim}>
      <div
        className={cx(
          styles.card,
          width === 'wide' && styles.cardWide,
          width === 'compact' && styles.cardCompact,
          chromeless && styles.cardChromeless,
        )}
      >
        {chromeless ? (
          <span className={styles.closeFloating}>
            <Icon name="close" size={18} />
          </span>
        ) : (
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <span className={styles.closeButton}>
              <Icon name="close" size={18} />
            </span>
          </div>
        )}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
