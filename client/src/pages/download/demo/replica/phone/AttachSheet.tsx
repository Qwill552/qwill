import { Icon } from '../../../../../ui/Icon';
import { ATTACH_TILES, REPLICA_TEXT } from './demoData';
import styles from './AttachSheet.module.css';

export function AttachSheet() {
  return (
    <div className={styles.layer}>
      <div className={styles.scrim} />
      <div className={styles.sheet}>
        <div className={styles.grip}>
          <span className={styles.gripBar} />
        </div>
        <p className={styles.title}>{REPLICA_TEXT.attachTitle}</p>
        <div className={styles.body}>
          <div className={styles.grid}>
            {ATTACH_TILES.map((tile) => (
              <span key={tile.id} className={styles.tile}>
                <span className={styles.tileIcon}>
                  <Icon name={tile.icon} size={24} />
                </span>
                <span className={styles.tileLabel}>{tile.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
