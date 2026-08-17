import { isNativeShell } from '../native/shell';
import { Icon } from '../ui/Icon';
import styles from './UpdateBanner.module.css';
import { useAppUpdate } from './useAppUpdate';

export function UpdateBanner() {
  const { updateAvailable, applyUpdate } = useAppUpdate();

  if (isNativeShell()) return null;
  if (!updateAvailable) return null;

  return (
    <button type="button" className={styles.banner} onClick={applyUpdate}>
      <span className={styles.icon}>
        <Icon name="retry" size={18} />
      </span>
      <span className={styles.label}>Обновить приложение</span>
    </button>
  );
}
