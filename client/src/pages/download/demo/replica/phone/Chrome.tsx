import type { ReactNode } from 'react';

import { Icon, type IconName } from '../../../../../ui/Icon';
import { avatarGradientFor } from '../../../../../ui/tint';
import { DOTS_GLYPH, SEARCH_GLYPH, TABS } from './demoData';
import styles from './Chrome.module.css';

export function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface AvatarProps {
  label: string;
  colorKey: string;
  size: number;
  online?: boolean;
  shadow?: boolean;
  className?: string;
}

export function Avatar({ label, colorKey, size, online, shadow, className }: AvatarProps) {
  return (
    <div className={cx(styles.avatarWrap, className)} style={{ width: size, height: size }}>
      <div
        className={cx(styles.avatarCircle, shadow && styles.avatarShadow)}
        style={{
          fontSize: size * 0.35,
          ['--replica-avatar-gradient' as string]: avatarGradientFor(colorKey),
        }}
      >
        {label.charAt(0).toUpperCase()}
      </div>
      {online && <span className={styles.onlineDot} />}
    </div>
  );
}

interface BadgeProps {
  count: number;
  muted?: boolean;
  small?: boolean;
  className?: string;
}

export function Badge({ count, muted, small, className }: BadgeProps) {
  if (count <= 0) return null;

  return (
    <span className={cx(styles.badge, muted && styles.badgeMuted, small && styles.badgeSmall, className)}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface ChipProps {
  label: string;
  active: boolean;
  count?: number;
}

export function Chip({ label, active, count }: ChipProps) {
  return (
    <span className={cx(styles.chip, active && styles.chipActive)}>
      {label}
      {count !== undefined && count > 0 && <span className={styles.chipCount}>{count}</span>}
    </span>
  );
}

export function SearchGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle
        cx={SEARCH_GLYPH.circle.cx}
        cy={SEARCH_GLYPH.circle.cy}
        r={SEARCH_GLYPH.circle.r}
        stroke="currentColor"
        strokeWidth={SEARCH_GLYPH.stroke}
      />
      <path d={SEARCH_GLYPH.handle} stroke="currentColor" strokeWidth={SEARCH_GLYPH.stroke} strokeLinecap="round" />
    </svg>
  );
}

export function DotsGlyph() {
  return (
    <svg width="4" height="16" viewBox="0 0 4 16" aria-hidden="true">
      {DOTS_GLYPH.map((cy) => (
        <circle key={cy} cx="2" cy={cy} r="1.8" fill="currentColor" />
      ))}
    </svg>
  );
}

interface ChromeBarProps {
  className?: string;
  children: ReactNode;
}

export function ChromeBar({ className, children }: ChromeBarProps) {
  return <div className={cx(styles.bar, className)}>{children}</div>;
}

export function GlassButton({ icon, size = 22 }: { icon: IconName; size?: number }) {
  return (
    <span className={styles.glassButton}>
      <Icon name={icon} size={size} />
    </span>
  );
}

interface HeaderPillProps {
  title: string;
  subtitle: string;
  leading: ReactNode;
}

export function HeaderPill({ title, subtitle, leading }: HeaderPillProps) {
  return (
    <span className={styles.pill}>
      {leading}
      <span className={styles.pillText}>
        <span className={styles.pillTitle}>{title}</span>
        <span className={styles.pillSubtitle}>{subtitle}</span>
      </span>
    </span>
  );
}

export function TabBar({ activeId, unread }: { activeId: string; unread: number }) {
  return (
    <div className={styles.tabBar}>
      <nav className={styles.tabCapsule}>
        {TABS.map((tab) => {
          const active = tab.id === activeId;
          return (
            <span key={tab.id} className={cx(styles.tab, active && styles.tabActive)}>
              <span className={styles.tabIconWrap}>
                <svg
                  className={cx(styles.tabIcon, active && styles.tabIconActive)}
                  width="25"
                  height="25"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d={tab.path}
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {tab.id === 'chats' && <Badge count={unread} small className={styles.tabBadge} />}
              </span>
              <span className={styles.tabLabel}>{tab.label}</span>
            </span>
          );
        })}
      </nav>
    </div>
  );
}

export function Fab() {
  return (
    <span className={styles.fab}>
      <Icon name="plus" size={20} />
    </span>
  );
}

export function OfficialMark({ size = 15 }: { size?: number }) {
  return (
    <span className={styles.officialMark} style={{ width: size, height: size }}>
      <Icon name="check" size={Math.round(size * 0.66)} />
    </span>
  );
}
