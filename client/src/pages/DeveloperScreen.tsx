import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { useDevPrefsStore } from '../stores/devPrefsStore';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { Switch } from '../ui/Switch';
import styles from './DeveloperScreen.module.css';

export function DeveloperScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const callStatsOverlayEnabled = useDevPrefsStore((s) => s.callStatsOverlayEnabled);
  const setCallStatsOverlayEnabled = useDevPrefsStore((s) => s.setCallStatsOverlayEnabled);
  const screenShareChangeMode = useDevPrefsStore((s) => s.screenShareChangeMode);
  const setScreenShareChangeMode = useDevPrefsStore((s) => s.setScreenShareChangeMode);
  const scrollerRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />
        <Card caption="Звонки">
          <Card.Row
            icon="monitor"
            tint="teal"
            title="Статистика звонка"
            subtitle="Оверлей с частотой кадров, кодеком и сетью"
            trailing={
              <Switch
                checked={callStatsOverlayEnabled}
                onChange={setCallStatsOverlayEnabled}
                label="Статистика звонка"
              />
            }
          />
          <Card.Row
            icon="retry"
            tint="orange"
            title="Переиздавать трек при смене источника"
            subtitle="Вместо подмены — снять демонстрацию и включить заново"
            trailing={
              <Switch
                checked={screenShareChangeMode === 'republish'}
                onChange={(checked) => setScreenShareChangeMode(checked ? 'republish' : 'replace')}
                label="Переиздавать трек при смене источника"
              />
            }
          />
          <Card.Row
            icon="history"
            tint="violet"
            title="Диагностика звонков"
            subtitle="Журнал последних событий звонка"
            onClick={() => navigate('/settings/developer/call-trace')}
          />
        </Card>
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в настройки" onClick={() => navigate('/settings')} />
          <GlassPill title="Для разработчиков" />
        </ChromeBar>
      )}
    </div>
  );
}
