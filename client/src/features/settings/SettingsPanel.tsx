import type { FontSize, ThemePreference } from '@messenger/shared';

import { useUiStore } from '../../stores/uiStore';
import { Modal } from '../groups/Modal';
import styles from './SettingsPanel.module.css';

interface SettingsPanelProps {
  onClose: () => void;
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Как в системе' },
];

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'A' },
  { value: 'medium', label: 'A' },
  { value: 'large', label: 'A' },
];

/** Тема и размер шрифта — применяются сразу через uiStore и сохраняются на сервере (этап 8). */
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const themePreference = useUiStore((s) => s.themePreference);
  const fontSize = useUiStore((s) => s.fontSize);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const setFontSize = useUiStore((s) => s.setFontSize);

  return (
    <Modal title="Настройки" onClose={onClose}>
      <p className={styles.sectionTitle}>Тема</p>
      <div className={styles.segmented}>
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.segment} ${themePreference === option.value ? styles.segmentActive : ''}`}
            onClick={() => setThemePreference(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className={styles.sectionTitle}>Размер шрифта</p>
      <div className={styles.segmented}>
        {FONT_SIZE_OPTIONS.map((option, index) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.segment} ${fontSize === option.value ? styles.segmentActive : ''}`}
            style={{ fontSize: 13 + index * 3 }}
            onClick={() => setFontSize(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
