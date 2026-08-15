import { useCallback, useEffect, useRef, useState } from 'react';

import type { AudioRoute } from '../../calls/types';
import { Icon } from '../../ui/Icon';
import { Ripple } from '../../ui/Ripple';
import styles from './CallControls.module.css';

interface CallControlsProps {
  micEnabled: boolean;
  onToggleMic: () => void;
  cameraEnabled?: boolean;
  onToggleCamera?: () => void;
  screenShareSupported?: boolean;
  screenShareEnabled?: boolean;
  onToggleScreenShare?: () => void;
  onChangeScreenShareSource?: () => void;
  audioRoute: AudioRoute;
  onToggleAudioRoute: () => void;
  onHangUp: () => void;
  glass?: boolean;
}

const SCREEN_SHARE_HINT = 'С телефона в браузере недоступно, появится в приложении для Android';
const SCREEN_SHARE_HINT_MS = 4000;

export function CallControls({
  micEnabled,
  onToggleMic,
  cameraEnabled = false,
  onToggleCamera,
  screenShareSupported = false,
  screenShareEnabled = false,
  onToggleScreenShare,
  onChangeScreenShareSource,
  audioRoute,
  onToggleAudioRoute,
  onHangUp,
  glass = false,
}: CallControlsProps) {
  const speakerOn = audioRoute === 'speaker';
  const speakerLabel = speakerOn ? 'Выключить громкую связь' : 'Включить громкую связь';
  const cameraLabel = cameraEnabled ? 'Выключить камеру' : 'Включить камеру';
  const screenLabel = screenShareEnabled ? 'Остановить демонстрацию экрана' : 'Демонстрация экрана';
  const surface = glass ? styles.glass : '';

  const [hintVisible, setHintVisible] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  const showHint = useCallback(() => {
    setHintVisible(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHintVisible(false), SCREEN_SHARE_HINT_MS);
  }, []);

  return (
    <div className={styles.controls}>
      <div className={styles.row}>
        {onToggleCamera ? (
          <button
            type="button"
            className={`${styles.control} ${styles.compact} ${surface} ${cameraEnabled ? styles.active : ''}`}
            aria-label={cameraLabel}
            aria-pressed={cameraEnabled}
            title={cameraLabel}
            onClick={onToggleCamera}
          >
            <Icon name="camera" size={20} />
            <Ripple />
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.placeholder} ${surface}`}
            disabled
            aria-label="Камера — появится позже"
            title="Камера — появится позже"
          >
            <Icon name="camera" size={22} />
          </button>
        )}

        {!onToggleScreenShare && (
          <button
            type="button"
            className={`${styles.placeholder} ${surface}`}
            disabled
            aria-label="Демонстрация экрана"
            title="Демонстрация экрана"
          >
            <Icon name="monitor" size={22} />
          </button>
        )}

        {onToggleScreenShare && screenShareSupported && (
          <span className={styles.shareAnchor}>
            <button
              type="button"
              className={`${styles.control} ${styles.compact} ${surface} ${screenShareEnabled ? styles.active : ''}`}
              aria-label={screenLabel}
              aria-pressed={screenShareEnabled}
              title={screenLabel}
              onClick={onToggleScreenShare}
            >
              <Icon name="monitor" size={20} />
              <Ripple />
            </button>
            {screenShareEnabled && onChangeScreenShareSource && (
              <button
                type="button"
                className={styles.sourceBadge}
                aria-label="Сменить источник демонстрации"
                title="Сменить источник демонстрации"
                onClick={onChangeScreenShareSource}
              >
                <span className={styles.sourceBadgeDot}>
                  <Icon name="chevron-down" size={14} />
                </span>
              </button>
            )}
          </span>
        )}

        {onToggleScreenShare && !screenShareSupported && (
          <span className={styles.hintAnchor}>
            <button
              type="button"
              className={`${styles.control} ${styles.compact} ${styles.unavailable} ${surface}`}
              aria-disabled="true"
              aria-label={`Демонстрация экрана. ${SCREEN_SHARE_HINT}`}
              title={SCREEN_SHARE_HINT}
              onClick={showHint}
            >
              <Icon name="monitor" size={20} />
            </button>
            {hintVisible && (
              <span className={styles.hint} role="status">
                {SCREEN_SHARE_HINT}
              </span>
            )}
          </span>
        )}
      </div>

      <div className={styles.row}>
        <button
          type="button"
          className={`${styles.control} ${surface} ${!micEnabled ? styles.active : ''}`}
          aria-label={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          title={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          onClick={onToggleMic}
        >
          <Icon name={micEnabled ? 'mic' : 'mic-off'} size={24} />
          <Ripple />
        </button>

        <button
          type="button"
          className={`${styles.control} ${surface} ${speakerOn ? styles.active : ''}`}
          aria-label={speakerLabel}
          aria-pressed={speakerOn}
          title={speakerLabel}
          onClick={onToggleAudioRoute}
        >
          <Icon name="speaker" size={24} />
          <Ripple />
        </button>

        <button type="button" className={styles.hangup} aria-label="Завершить звонок" title="Завершить звонок" onClick={onHangUp}>
          <Icon name="phone" size={24} className={styles.hangupGlyph} />
          <Ripple />
        </button>
      </div>
    </div>
  );
}
