import { Icon } from '../../../../../ui/Icon';
import { cx } from './Chrome';
import { REPLICA_TEXT } from './demoData';
import styles from './Composer.module.css';

interface ComposerProps {
  text: string;
  recording: boolean;
}

function Recorder() {
  return (
    <div className={styles.field}>
      <span className={styles.recordDot} />
      <span className={styles.recordTimer}>{REPLICA_TEXT.recordingTimer}</span>
      <span className={styles.recordLock}>
        <Icon name="lock" size={14} />
      </span>
      <span className={styles.recordHint}>
        <Icon name="back" size={14} />
        {REPLICA_TEXT.recordingHint}
      </span>
    </div>
  );
}

export function Composer({ text, recording }: ComposerProps) {
  const hasText = text.length > 0;

  return (
    <div className={styles.composer}>
      {recording ? (
        <Recorder />
      ) : (
        <div className={styles.field}>
          <span className={styles.round}>
            <Icon name="emoji" size={22} />
          </span>
          <span className={cx(styles.input, !hasText && styles.inputEmpty)}>
            {hasText ? text : REPLICA_TEXT.composerPlaceholder}
          </span>
          <span className={styles.round}>
            <Icon name="attach" size={21} />
          </span>
        </div>
      )}

      <span className={cx(styles.send, recording && styles.sendRecording)}>
        <Icon name={hasText ? 'send' : 'mic'} size={22} />
      </span>
    </div>
  );
}
