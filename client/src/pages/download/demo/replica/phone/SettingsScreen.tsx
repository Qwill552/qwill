import { IconTile } from '../../../../../ui/IconTile';
import { Avatar } from './Chrome';
import { PEOPLE, SETTINGS_SECTIONS, SETTINGS_TEXT } from './demoData';
import styles from './SettingsScreen.module.css';

export function SettingsScreen() {
  const me = PEOPLE.me;

  return (
    <div className={styles.screen}>
      <div className={styles.scroller}>
        <div className={styles.hero}>
          <Avatar label={me.name} colorKey={me.id} size={96} />
          <span className={styles.name}>{me.name}</span>
          <span className={styles.username}>{me.username}</span>
        </div>

        {SETTINGS_SECTIONS.map((section, sectionIndex) => (
          <div key={sectionIndex} className={styles.card}>
            {section.map((row) => (
              <div key={row.id} className={styles.row}>
                <IconTile icon={row.icon} tint={row.tint} />
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle}>{row.title}</span>
                  <span className={styles.rowSubtitle}>{row.subtitle}</span>
                </span>
              </div>
            ))}
          </div>
        ))}

        <span className={styles.footer}>
          <span>{SETTINGS_TEXT.version}</span>
          <span aria-hidden="true">·</span>
          <span className={styles.license}>{SETTINGS_TEXT.license}</span>
        </span>
      </div>
    </div>
  );
}
