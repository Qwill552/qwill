import { Icon } from '../../../../../ui/Icon';
import type { DemoReadout } from '../../engine/store';
import { cx } from './Chrome';
import { PRESS, REPLICA_TEXT } from './demoData';
import styles from './Composer.module.css';

interface ComposerProps {
  text: string;
  focused: boolean;
  recording: boolean;
  pressed?: string | null;
  typingReadout?: DemoReadout;
  voiceReadout?: DemoReadout;
}

function Recorder({ voiceReadout }: { voiceReadout?: DemoReadout }) {
  return (
    <div className={styles.field}>
      <span className={styles.recordDot} />
      <span className={styles.recordTimer} ref={voiceReadout} />
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

export function Composer({
  text,
  focused,
  recording,
  pressed,
  typingReadout,
  voiceReadout,
}: ComposerProps) {
  const hasText = text.length > 0;

  return (
    <div className={styles.composer}>
      {recording ? (
        <Recorder voiceReadout={voiceReadout} />
      ) : (
        <div
          className={cx(
            styles.field,
            focused && styles.fieldFocused,
            pressed === PRESS.composer && styles.fieldPressed,
          )}
        >
          <span className={styles.round}>
            <Icon name="emoji" size={22} />
          </span>
          <span className={cx(styles.input, !hasText && styles.inputEmpty)}>
            {hasText && <span ref={typingReadout} />}
            {!hasText && !focused && REPLICA_TEXT.composerPlaceholder}
            {focused && <span className={styles.caret} />}
          </span>
          <span className={styles.round}>
            <Icon name="attach" size={21} />
          </span>
        </div>
      )}

      <span
        className={cx(
          styles.send,
          recording && styles.sendRecording,
          pressed === PRESS.send && styles.sendPressed,
          pressed === PRESS.mic && styles.sendHeld,
        )}
      >
        <Icon name={hasText ? 'send' : 'mic'} size={22} />
      </span>
    </div>
  );
}
