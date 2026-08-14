import type { AudioRoute } from '../../calls/types';
import { Icon } from '../../ui/Icon';
import { Ripple } from '../../ui/Ripple';
import styles from './CallControls.module.css';

interface CallControlsProps {
  micEnabled: boolean;
  onToggleMic: () => void;
  audioRoute: AudioRoute;
  onToggleAudioRoute: () => void;
  onHangUp: () => void;
}

export function CallControls({ micEnabled, onToggleMic, audioRoute, onToggleAudioRoute, onHangUp }: CallControlsProps) {
  const speakerOn = audioRoute === 'speaker';
  const speakerLabel = speakerOn ? 'Выключить громкую связь' : 'Включить громкую связь';

  return (
    <div className={styles.controls}>
      <div className={styles.row}>
        <button type="button" className={styles.placeholder} disabled aria-label="Камера — появится позже" title="Камера — появится позже">
          <Icon name="camera" size={22} />
        </button>
        <button
          type="button"
          className={styles.placeholder}
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
          className={`${styles.control} ${!micEnabled ? styles.active : ''}`}
          aria-label={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          title={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          onClick={onToggleMic}
        >
          <Icon name={micEnabled ? 'mic' : 'mic-off'} size={24} />
          <Ripple />
        </button>

        <button
          type="button"
          className={`${styles.control} ${speakerOn ? styles.active : ''}`}
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
