import { Icon } from '../../../../../ui/Icon';
import { AmbientBlobs, Avatar, ChromeBar, GlassButton } from './Chrome';
import { CardWindow } from './CardWindow';
import { MEDIA_TABS, PEOPLE, PROFILE_ACTIONS, PROFILE_TEXT, type ScreenSurface } from './demoData';
import styles from './ProfileScreen.module.css';

interface ProfileScreenProps {
  surface?: ScreenSurface;
}

export function ProfileScreen({ surface }: ProfileScreenProps) {
  const person = PEOPLE.grisha;

  return (
    <div className={styles.screen}>
      <AmbientBlobs />
      <div className={styles.scroller} ref={surface?.viewport}>
        <div className={styles.scrollerInner} ref={surface?.inner}>
          <div className={styles.hero}>
            <Avatar label={person.name} colorKey={person.id} size={108} shadow />
            <span className={styles.name}>{person.name}</span>
            <span className={styles.status}>{PROFILE_TEXT.status}</span>
          </div>

          <div className={styles.actions}>
            {PROFILE_ACTIONS.map((action) => (
              <span key={action.id} className={styles.action}>
                <Icon name={action.icon} size={22} solid={action.solid} className={styles.actionIcon} />
                {action.label}
              </span>
            ))}
          </div>

          <CardWindow />

          <div className={styles.infoCard}>
            <span className={styles.infoRow}>
              <span className={styles.infoTitle}>{person.username}</span>
              <span className={styles.infoSubtitle}>{PROFILE_TEXT.usernameLabel}</span>
            </span>
          </div>

          <div className={styles.tabs}>
            {MEDIA_TABS.map((label, index) => (
              <span key={label} className={index === 0 ? styles.tabActive : styles.tab}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ChromeBar className={styles.header}>
        <GlassButton icon="back" />
      </ChromeBar>
    </div>
  );
}
