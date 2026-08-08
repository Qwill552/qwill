import type { FontSize, ThemePreference } from '@messenger/shared';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { AmbientBlobs } from '../app/AmbientBlobs';
import { useUiStore } from '../stores/uiStore';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { SegmentedControl, type Segment } from '../ui/SegmentedControl';
import styles from './AppearanceScreen.module.css';

const THEMES: Segment<ThemePreference>[] = [
  { value: 'system', label: 'Системная' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

const SIZES: Segment<FontSize>[] = [
  { value: 'small', label: 'Мелкий' },
  { value: 'medium', label: 'Обычный' },
  { value: 'large', label: 'Крупный' },
];

/** Оформление: тема и размер шрифта. Единый визуальный язык (liquid glass, референс «Пульс») —
 *  переключателя Стекло/Строгий больше нет, см. журнал ux-ui.md. Каждое изменение применяется
 *  сразу и уходит на сервер существующим механизмом uiStore. */
export function AppearanceScreen() {
  const navigate = useNavigate();
  const themePreference = useUiStore((s) => s.themePreference);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const fontSize = useUiStore((s) => s.fontSize);
  const setFontSize = useUiStore((s) => s.setFontSize);
  const scrollerRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.screen}>
      <AmbientBlobs />
      <div ref={scrollerRef} className={`${styles.scroller} hide-native-scrollbar`}>
        <ScrollIndicator target={scrollerRef} />
        <Card caption="Тема">
          <div className={styles.control}>
            <SegmentedControl label="Тема" segments={THEMES} value={themePreference} onChange={setThemePreference} />
          </div>
        </Card>

        <Card caption="Размер шрифта">
          <div className={styles.sizeRow}>
            <span className={styles.sizeSmall}>А</span>
            <SegmentedControl label="Размер шрифта" segments={SIZES} value={fontSize} onChange={setFontSize} />
            <span className={styles.sizeLarge}>А</span>
          </div>
          {/* Живой пузырь тем же токеном, что и в ленте: размер видно сразу, а не после выхода. */}
          <div className={styles.sample}>
            <span className={styles.sampleBubble}>Так будет выглядеть сообщение</span>
          </div>
        </Card>
      </div>

      <ChromeBar>
        <GlassButton icon="back" label="Назад в настройки" onClick={() => navigate('/settings')} />
        <GlassPill title="Оформление" />
      </ChromeBar>
    </div>
  );
}
