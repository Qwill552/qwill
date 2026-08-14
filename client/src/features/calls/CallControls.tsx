import type { AudioRoute } from '../../calls/types';
import { Icon } from '../../ui/Icon';
import { Ripple } from '../../ui/Ripple';
import styles from './CallControls.module.css';

interface CallControlsProps {
  micEnabled: boolean;
  onToggleMic: () => void;
  cameraEnabled?: boolean;
  onToggleCamera?: () => void;
  audioRoute: AudioRoute;
  onToggleAudioRoute: () => void;
  onHangUp: () => void;
  glass?: boolean;
}

export function CallControls({
  micEnabled,
  onToggleMic,
  cameraEnabled = false,
  onToggleCamera,
  audioRoute,
  onToggleAudioRoute,
  onHangUp,
  glass = false,
}: CallControlsProps) {
  const speakerOn = audioRoute === 'speaker';
  const speakerLabel = speakerOn ? 'Выключить громкую связь' : 'Включить громкую связь';
  const cameraLabel = cameraEnabled ? 'Выключить камеру' : 'Включить камеру';
  const surface = glass ? styles.glass : '';

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
        <button
          type="button"
          className={`${styles.placeholder} ${surface}`}
          disabled
          aria-label="Демонстрация экрана — появится позже"
          title="Демонстрация экрана — появится позже"
        >
          <Icon name="monitor" size={22} />
        </button>
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
