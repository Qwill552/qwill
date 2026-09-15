import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useDesktopUpdateStore } from '../app/desktopUpdate';
import { useLayoutMode } from '../app/useLayoutMode';
import { useDesktopUpdateStatus } from '../features/updates/DesktopUpdate';
import { getDesktopAutostart, isDesktopAutostartAvailable, setDesktopAutostart } from '../native/desktop';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { Switch } from '../ui/Switch';
import styles from './AdvancedScreen.module.css';

export function AdvancedScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const scrollerRef = useRef<HTMLDivElement>(null);

  const currentVersion = useDesktopUpdateStore((s) => s.currentVersion);
  const autoUpdate = useDesktopUpdateStore((s) => s.autoUpdate);
  const setAutoUpdate = useDesktopUpdateStore((s) => s.setAutoUpdate);
  const updateStatus = useDesktopUpdateStatus();

  const autostartAvailable = isDesktopAutostartAvailable();
  const [autostartEnabled, setAutostartEnabled] = useState(false);

  useEffect(() => {
    if (!autostartAvailable) return;
    void getDesktopAutostart().then(setAutostartEnabled);
  }, [autostartAvailable]);

  function handleAutostartChange(enabled: boolean): void {
    setAutostartEnabled(enabled);
    setDesktopAutostart(enabled);
  }

  const versionLine = [currentVersion ? `Версия ${currentVersion}` : null, autoUpdate ? updateStatus : null]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />

        {autostartAvailable && (
          <Card caption="Система">
            <Card.Row
              icon="monitor"
              tint="indigo"
              title="Запускать Qwill при запуске системы"
              subtitle="Приложение стартует свёрнутым в трей"
              trailing={
                <Switch
                  checked={autostartEnabled}
                  onChange={handleAutostartChange}
                  label="Запускать Qwill при запуске системы"
                />
              }
            />
          </Card>
        )}

        <Card caption="Версия и обновления">
          <Card.Row
            icon="retry"
            tint="green"
            title="Обновлять автоматически"
            subtitle={versionLine || undefined}
            trailing={
              <Switch checked={autoUpdate} onChange={setAutoUpdate} label="Обновлять автоматически" />
            }
          />
        </Card>
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в настройки" onClick={() => navigate('/settings')} />
          <GlassPill title="Продвинутые настройки" />
        </ChromeBar>
      )}
    </div>
  );
}
