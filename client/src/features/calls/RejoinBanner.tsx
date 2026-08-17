import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { Icon } from '../../ui/Icon';
import styles from './CallBanner.module.css';

export function RejoinBanner() {
  const call = useCallStore((s) => s.rejoinable);
  const rejoinCall = useCallStore((s) => s.rejoinCall);
  const myId = useAuthStore((s) => s.user?.id) ?? null;

  if (!call) return null;

  const otherMember = call.participants.find((p) => p.user.id !== myId)?.user ?? null;
  const displayName = otherMember?.displayName ?? 'Звонок';

  return (
    <button type="button" className={styles.banner} onClick={() => void rejoinCall()}>
      <Icon name="phone" size={18} className={styles.icon} />
      <span className={styles.label}>{displayName}</span>
      <span className={styles.time}>Вернуться в звонок</span>
    </button>
  );
}
