import type { MessageReplyPreviewDto } from '@messenger/shared';

import styles from './ReplyQuote.module.css';

function previewText(reply: MessageReplyPreviewDto): string {
  if (reply.deletedAt) return 'Сообщение удалено';
  if (reply.content) return reply.content;
  if (reply.hasAttachment) return '📎 Вложение';
  return '';
}

export function ReplyQuote({ reply }: { reply: MessageReplyPreviewDto }) {
  return (
    <div className={styles.quote}>
      <span className={styles.name}>{reply.senderName}</span>
      <span className={styles.text}>{previewText(reply)}</span>
    </div>
  );
}
