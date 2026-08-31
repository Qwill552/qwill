import type { ReportGroupDto } from '@messenger/shared';

import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { formatChatRowWhen } from '../messages/dayLabel';
import styles from './ReportGroupRow.module.css';

function reportGroupTitle(group: ReportGroupDto): string {
  if (group.kind === 'card') return `визитка @${group.targetUsername}`;
  if (group.kind === 'profile') return `профиль @${group.targetUsername}`;
  return group.chatTitle || 'Чат';
}

interface ReportGroupRowProps {
  group: ReportGroupDto;
  onOpen: () => void;
}

export function ReportGroupRow({ group, onOpen }: ReportGroupRowProps) {
  const isMessage = group.kind === 'message';

  return (
    <Card.Row
      onClick={onOpen}
      leading={
        <span className={styles.avatarWrap}>
          {group.hasNew && <span className={styles.newDot} aria-hidden="true" />}
          <Avatar
            label={isMessage ? group.chatTitle || '' : group.targetDisplayName}
            avatarUrl={isMessage ? group.chatAvatarUrl : group.targetAvatarUrl}
            color={isMessage ? undefined : (group.targetAvatarColor ?? undefined)}
            colorKey={isMessage ? (group.targetChatId ?? undefined) : undefined}
            size={44}
          />
        </span>
      }
      title={reportGroupTitle(group)}
      subtitle={
        <span className={styles.meta}>
          <span className={styles.comment}>«{group.lastComment}»</span>
          <span className={styles.time}>{formatChatRowWhen(group.lastCreatedAt)}</span>
        </span>
      }
      trailing={<Badge count={group.openCount} />}
    />
  );
}
