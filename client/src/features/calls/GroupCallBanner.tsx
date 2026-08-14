import type { CallDto } from '@messenger/shared';

import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import styles from './GroupCallBanner.module.css';

const AVATAR_PREVIEW_LIMIT = 4;

interface GroupCallBannerProps {
  call: CallDto;
  onJoin: () => void;
}

export function GroupCallBanner({ call, onJoin }: GroupCallBannerProps) {
  const activeParticipants = call.participants.filter((p) => p.leftAt === null);

  return (
    <div className={styles.banner}>
      <div className={styles.avatars}>
        {activeParticipants.slice(0, AVATAR_PREVIEW_LIMIT).map((p) => (
          <Avatar
            key={p.user.id}
            label={p.user.displayName}
            avatarUrl={p.user.avatarUrl}
            color={p.user.avatarColor}
            colorKey={p.user.id}
            size={28}
            className={styles.avatarItem}
          />
        ))}
      </div>
      <span className={styles.label}>Идёт звонок · {activeParticipants.length}</span>
      <button type="button" className={styles.join} onClick={onJoin} aria-label="Присоединиться к звонку" title="Присоединиться к звонку">
        <Icon name="phone" size={20} />
      </button>
    </div>
  );
}
