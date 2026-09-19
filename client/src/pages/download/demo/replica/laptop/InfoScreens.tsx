import { Icon } from '../../../../../ui/Icon';
import { IconTile } from '../../../../../ui/IconTile';
import { CardWindow } from '../phone/CardWindow';
import { Avatar, cx } from '../phone/Chrome';
import {
  DESKTOP_TEXT,
  MEDIA_TABS,
  PEOPLE,
  PROFILE_ACTIONS,
  PROFILE_TEXT,
  QR_PATTERN,
  QR_TEXT,
  SETTINGS_SECTIONS,
  SETTINGS_TEXT,
  WALLPAPER_OPTIONS,
  WALLPAPER_TEXT,
  type ReplicaScreen,
} from '../phone/demoData';
import { ScreenCard } from './ScreenCard';
import styles from './InfoScreens.module.css';

function ProfileContent() {
  const person = PEOPLE.grisha;

  return (
    <div className={styles.profile}>
      <div className={styles.hero}>
        <Avatar label={person.name} colorKey={person.id} size={96} shadow />
        <span className={styles.name}>{person.name}</span>
        <span className={styles.status}>{PROFILE_TEXT.status}</span>
      </div>

      <div className={styles.actions}>
        {PROFILE_ACTIONS.map((action) => (
          <span key={action.id} className={styles.action}>
            <Icon name={action.icon} size={20} solid={action.solid} />
            {action.label}
          </span>
        ))}
      </div>

      <CardWindow />

      <div className={styles.infoRow}>
        <span className={styles.infoTitle}>{person.username}</span>
        <span className={styles.infoSubtitle}>{PROFILE_TEXT.usernameLabel}</span>
      </div>

      <div className={styles.tabs}>
        {MEDIA_TABS.map((label, index) => (
          <span key={label} className={cx(styles.tab, index === 0 && styles.tabActive)}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function WallpaperContent({ selectedIndex }: { selectedIndex: number }) {
  const selected = WALLPAPER_OPTIONS[selectedIndex] ?? WALLPAPER_OPTIONS[0]!;

  return (
    <div className={styles.wallpaper}>
      <div className={styles.swatchGrid}>
        {WALLPAPER_OPTIONS.map((option, index) => (
          <span key={option.id} className={styles.swatch}>
            <span
              className={cx(
                styles.tile,
                option.kind === 'pattern' && styles.tilePattern,
                index === selectedIndex && styles.tileCurrent,
              )}
              style={{ background: option.value }}
            >
              {index === selectedIndex && (
                <span className={styles.check}>
                  <Icon name="check" size={16} />
                </span>
              )}
            </span>
            <span className={styles.swatchLabel}>{option.title}</span>
          </span>
        ))}
      </div>

      <div className={styles.preview}>
        <div
          className={cx(styles.previewWallpaper, selected.kind === 'pattern' && styles.previewWallpaperPattern)}
          style={{ background: selected.value }}
        />
        <div className={styles.previewBubbleIn}>{WALLPAPER_TEXT.previewMessages[0]}</div>
        <div className={styles.previewBubbleOut}>{WALLPAPER_TEXT.previewMessages[1]}</div>
      </div>
    </div>
  );
}

function QrContent() {
  const person = PEOPLE.grisha;
  const side = QR_PATTERN.length;

  return (
    <div className={styles.qr}>
      <Avatar label={person.name} colorKey={person.id} size={64} />
      <span className={styles.qrName}>{person.name}</span>

      <div className={styles.paper}>
        <div className={styles.code} style={{ gridTemplateColumns: `repeat(${side}, 1fr)` }}>
          {QR_PATTERN.flatMap((row, rowIndex) =>
            row.map((dark, colIndex) => (
              <span
                key={`${rowIndex}-${colIndex}`}
                className={dark ? styles.moduleDark : styles.moduleLight}
              />
            )),
          )}
        </div>
      </div>

      <span className={styles.username}>{person.username}</span>
      <span className={styles.hint}>{QR_TEXT.hint}</span>
      <span className={styles.share}>{QR_TEXT.button}</span>
    </div>
  );
}

function SettingsContent() {
  return (
    <div className={styles.settings}>
      {SETTINGS_SECTIONS.map((section, sectionIndex) => (
        <div key={sectionIndex} className={styles.section}>
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
        <span>{SETTINGS_TEXT.license}</span>
      </span>
    </div>
  );
}

interface InfoScreensProps {
  screen: Exclude<ReplicaScreen, 'chats' | 'chat' | 'call'>;
  wallpaperIndex: number;
}

export function InfoScreens({ screen, wallpaperIndex }: InfoScreensProps) {
  if (screen === 'profile') {
    return (
      <ScreenCard title={DESKTOP_TEXT.profileCardTitle} width="wide" chromeless>
        <ProfileContent />
      </ScreenCard>
    );
  }

  if (screen === 'wallpaper') {
    return (
      <ScreenCard title={WALLPAPER_TEXT.title}>
        <WallpaperContent selectedIndex={wallpaperIndex} />
      </ScreenCard>
    );
  }

  if (screen === 'qr') {
    return (
      <ScreenCard title={QR_TEXT.title} width="compact">
        <QrContent />
      </ScreenCard>
    );
  }

  return (
    <ScreenCard title={DESKTOP_TEXT.settingsCardTitle}>
      <SettingsContent />
    </ScreenCard>
  );
}
