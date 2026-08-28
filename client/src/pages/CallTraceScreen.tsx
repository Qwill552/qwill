import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AmbientBlobs } from '../app/AmbientBlobs';
import { useLayoutMode } from '../app/useLayoutMode';
import { clearCallTrace, formatCallTrace } from '../calls/callTrace';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
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
      <div className={`${styles.scroller} hide-native-scrollbar`}>
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
