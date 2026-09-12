import type { MessageDto } from '@messenger/shared';

import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { formatAttachmentDateTime } from '../messages/dayLabel';
import { highlight } from './highlight';
import styles from './ChatSearchRow.module.css';

interface ChatSearchRowProps {
  message: MessageDto;
  query: string;
  own: boolean;
  active?: boolean;
  onSelect: () => void;
}

function previewOf(message: MessageDto): string {
  if (message.content) return message.content;
  if (message.attachment) return 'Вложение';
  return 'Сообщение';
}

export function ChatSearchRow({ message, query, own, active = false, onSelect }: ChatSearchRowProps) {
  const text = previewOf(message);

  return (
    <button
      type="button"
      className={`${styles.row} ${active ? styles.active : ''}`}
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
    >
      <Avatar
        label={message.sender?.displayName ?? '?'}
        avatarUrl={message.sender?.avatarUrl}
        size={44}
        color={message.sender?.avatarColor}
        colorKey={message.sender?.id}
      />
      <span className={styles.body}>
        <span className={styles.line}>
          <span className={styles.name}>{message.sender?.displayName ?? 'Удалённый аккаунт'}</span>
          {own && <Icon name="check" size={15} className={styles.sentMark} />}
          <span className={styles.date}>{formatAttachmentDateTime(message.createdAt)}</span>
        </span>
        <span className={styles.snippet}>{message.content ? highlight(text, query) : text}</span>
      </span>
    </button>
  );
}
