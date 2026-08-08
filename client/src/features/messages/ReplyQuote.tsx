import type { MessageReplyPreviewDto } from '@messenger/shared';

import styles from './ReplyQuote.module.css';

function previewText(reply: MessageReplyPreviewDto): string {
  if (reply.deletedAt) return 'Сообщение удалено';
  if (reply.content) return reply.content;
  if (reply.hasAttachment) return 'Вложение';
  return '';
}

/** Цитата внутри пузыря. `own` меняет только палитру: на градиенте исходящего
 *  акцентный фиолетовый не читается. */
export function ReplyQuote({ reply, own }: { reply: MessageReplyPreviewDto; own?: boolean }) {
  return (
    <div className={`${styles.quote} ${own ? styles.onOut : ''}`}>
      <span className={styles.name}>{reply.senderName}</span>
      <span className={styles.text}>{previewText(reply)}</span>
    </div>
  );
}
