import { useUiStore } from '../../../stores/uiStore';
import { Icon } from '../../../ui/Icon';
import { CONTENT } from '../content';
import styles from './PageHeader.module.css';

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={toggleTheme}
      title={CONTENT.themeToggleLabel}
      aria-label={CONTENT.themeToggleLabel}
    >
      <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={22} />
    </button>
  );
}
