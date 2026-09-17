import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { clearCallTrace, formatCallTrace } from '../calls/callTrace';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { Icon } from '../ui/Icon';
import styles from './CallTraceScreen.module.css';

const COPIED_MS = 1500;

export function CallTraceScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const [text, setText] = useState(() => formatCallTrace());
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatCallTrace());
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false);
    }
  }

  function handleClear(): void {
    clearCallTrace();
    setText(formatCallTrace());
  }

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}>
        {isDesktop && (
          <div className={`${card.actionRow} ${styles.actions}`}>
            <button type="button" className={card.actionTile} onClick={() => void handleCopy()}>
              <Icon name="copy" size={23} className={card.actionTileIcon} />
              {copied ? 'Скопировано' : 'Скопировать журнал'}
            </button>
            <button type="button" className={card.actionTile} onClick={handleClear} disabled={text.length === 0}>
              <Icon name="trash" size={23} className={card.actionTileIcon} />
              Очистить журнал
            </button>
          </div>
        )}
        {text.length === 0 ? <p className={styles.empty}>Журнал пуст</p> : <pre className={styles.log}>{text}</pre>}
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в настройки" onClick={() => navigate('/settings/developer')} />
          <GlassPill title="Диагностика звонков" subtitle={copied ? 'скопировано' : undefined} />
          <GlassButton icon="trash" label="Очистить журнал" onClick={handleClear} />
          <GlassButton icon="copy" label="Скопировать журнал" onClick={() => void handleCopy()} />
        </ChromeBar>
      )}
    </div>
  );
}
