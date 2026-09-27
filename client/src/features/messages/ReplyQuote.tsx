import type { MessageReplyPreviewDto } from '@messenger/shared';
import type { KeyboardEvent } from 'react';

import styles from './ReplyQuote.module.css';

function previewText(reply: MessageReplyPreviewDto): string {
  if (reply.deletedAt) return 'Сообщение удалено';
  if (reply.content) return reply.content;
  if (reply.hasAttachment) return 'Вложение';
  return '';
}

/** Цитата внутри пузыря. `own` меняет только палитру: на градиенте исходящего
 *  акцентный фиолетовый не читается. */
export function ReplyQuote({
  reply,
  own,
  onJump,
}: {
  reply: MessageReplyPreviewDto;
  own?: boolean;
  onJump?: () => void;
}) {
  const interactive = onJump !== undefined && !reply.deletedAt;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onJump?.();
  }

  return (
    <div
      className={`${styles.quote} ${own ? styles.onOut : ''} ${interactive ? styles.interactive : ''}`}
      data-reply-quote={interactive ? 'true' : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `К сообщению ${reply.senderName}` : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      <span className={styles.name}>{reply.senderName}</span>
      <span className={styles.text}>{previewText(reply)}</span>
    </div>
  );
}
