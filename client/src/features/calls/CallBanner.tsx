import { useCallStore } from '../../stores/callStore';
import { useAuthStore } from '../../stores/authStore';
import { Icon } from '../../ui/Icon';
import styles from './CallBanner.module.css';
import { useCallDuration } from './useCallDuration';

interface CallBannerProps {
  onExpand: () => void;
}

export function CallBanner({ onExpand }: CallBannerProps) {
  const call = useCallStore((s) => s.call);
  const startedAt = useCallStore((s) => s.startedAt);
  const myId = useAuthStore((s) => s.user?.id) ?? null;
  const duration = useCallDuration(startedAt);

  const otherMember = call?.participants.find((p) => p.user.id !== myId)?.user ?? null;
  const displayName = otherMember?.displayName ?? '…';

  return (
    <button type="button" className={styles.banner} onClick={onExpand}>
      <Icon name="phone" size={18} className={styles.icon} />
      <span className={styles.label}>{displayName}</span>
      <span className={styles.time}>{duration ?? '00:00'}</span>
    </button>
  );
}
