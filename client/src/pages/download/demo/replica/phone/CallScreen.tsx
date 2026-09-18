import { Icon } from '../../../../../ui/Icon';
import { Avatar, cx } from './Chrome';
import { CALL_TEXT, PEOPLE } from './demoData';
import styles from './CallScreen.module.css';

export function CallScreen() {
  const person = PEOPLE.grisha;

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <span className={styles.collapse}>
          <Icon name="chevron-down" size={22} />
        </span>
      </div>

      <div className={styles.body}>
        <span className={styles.avatarRing}>
          <Avatar label={person.name} colorKey={person.id} size={128} />
        </span>
        <span className={styles.name}>{person.name}</span>
        <span className={styles.status}>{CALL_TEXT.status}</span>
      </div>

      <div className={styles.controls}>
        <span className={styles.control}>
          <Icon name="mic" size={24} />
        </span>
        <span className={styles.control}>
          <Icon name="speaker" size={24} />
        </span>
        <span className={cx(styles.control, styles.controlOff)}>
          <Icon name="camera" size={22} />
        </span>
        <span className={cx(styles.control, styles.hangup)}>
          <Icon name="phone" size={24} className={styles.hangupGlyph} />
        </span>
      </div>
    </div>
  );
}
