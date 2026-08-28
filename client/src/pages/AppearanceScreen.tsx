import type { FontSize, ThemePreference } from '@messenger/shared';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { isNativeShell, type CallBackgroundStyle } from '../calls/nativeCall';
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

const CALL_BACKGROUNDS: Segment<CallBackgroundStyle>[] = [
  { value: 'glow', label: 'Свечение' },
  { value: 'blobs', label: 'Пятна' },
];

/** Оформление: тема и размер шрифта. Единый визуальный язык (liquid glass, референс «Пульс») —
 *  переключателя Стекло/Строгий больше нет, см. журнал ux-ui.md. Каждое изменение применяется
 *  сразу и уходит на сервер существующим механизмом uiStore. */
export function AppearanceScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const themePreference = useUiStore((s) => s.themePreference);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const fontSize = useUiStore((s) => s.fontSize);
  const setFontSize = useUiStore((s) => s.setFontSize);
  const callBackground = useUiStore((s) => s.callBackground);
  const setCallBackground = useUiStore((s) => s.setCallBackground);
  const scrollerRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
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

        {isNativeShell() && (
          <Card caption="Фон звонка">
            <div className={styles.control}>
              <SegmentedControl
                label="Фон звонка"
                segments={CALL_BACKGROUNDS}
                value={callBackground}
                onChange={setCallBackground}
              />
            </div>
          </Card>
        )}
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в настройки" onClick={() => navigate('/settings')} />
          <GlassPill title="Оформление" />
        </ChromeBar>
      )}
    </div>
  );
}
