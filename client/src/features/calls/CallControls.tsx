import { Icon } from '../../ui/Icon';
import { Ripple } from '../../ui/Ripple';
import styles from './CallControls.module.css';

interface CallControlsProps {
  micEnabled: boolean;
  onToggleMic: () => void;
  speakerEnabled: boolean;
  onToggleSpeaker: () => void;
  onHangUp: () => void;
}

export function CallControls({ micEnabled, onToggleMic, speakerEnabled, onToggleSpeaker, onHangUp }: CallControlsProps) {
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
          className={`${styles.control} ${!speakerEnabled ? styles.active : ''}`}
          aria-label={speakerEnabled ? 'Выключить динамик' : 'Включить динамик'}
          title={speakerEnabled ? 'Выключить динамик' : 'Включить динамик'}
          onClick={onToggleSpeaker}
        >
          <Icon name={speakerEnabled ? 'speaker' : 'speaker-off'} size={24} />
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
