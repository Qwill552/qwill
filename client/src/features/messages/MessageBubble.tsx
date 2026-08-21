import type { ReactNode } from 'react';

import { type LocalMessage, useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { tintVar } from '../../ui/tint';
import { AnnouncementBubble } from '../chat/AnnouncementBubble';
import { Emoji } from '../emoji/Emoji';
import { emojiOnlyContent, parseEmoji } from '../emoji/parseEmoji';
import { VoiceMessage } from '../voice/VoiceMessage';
import { AttachmentView, isVoiceAttachment, LocalAttachmentPreview } from './Attachment';
import { CallMessage } from './CallMessage';
import { MessageMeta } from './MessageMeta';
import { ReplyQuote } from './ReplyQuote';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: LocalMessage;
  own: boolean;
  read: boolean;
  /** Показывать имя автора (группа, первое сообщение серии). */
  showAuthor: boolean;
  /** Чипы реакций и прочее, что рисуется под текстом внутри пузыря. */
  children?: ReactNode;
}

/** Буквально из референса (строка 332): фиксированный радиус 20/20/7/20 (свои) или
 *  20/20/20/7 (чужие) — без поджатия углов в сериях, без хвостиков. Метаданные —
 *  абсолютом в правом нижнем углу (строка 333), текст резервирует под них место
 *  невидимой распоркой после себя (строка 339: `{{ m.pad }}`), а не float. */
export function MessageBubble({ message, own, read, showAuthor, children }: MessageBubbleProps) {
  const status: 'sending' | 'sent' | 'failed' =
    message.status === 'sending' ? 'sending' : message.status === 'failed' ? 'failed' : 'sent';
  const isVoice = message.attachment !== null && isVoiceAttachment(message.attachment);

  const bare =
    !showAuthor &&
    !message.forwardedFrom &&
    !message.replyTo &&
    !message.attachment &&
    !message.localAttachment &&
    !message.deletedAt;
  const retryMessage = useChatStore((s) => s.retryMessage);
  const cancelAttachmentUpload = useChatStore((s) => s.cancelAttachmentUpload);
  const emojiOnly = bare ? emojiOnlyContent(message.content ?? '') : null;

  if (emojiOnly) {
    return (
      <div className={styles.emojiOnly}>
        <span className={styles.emojiAnchor}>
          <span className={styles.emojiRow}>
            {emojiOnly.map((emoji, i) => (
              <Emoji key={i} emoji={emoji} size={48} />
            ))}
            <span
              className={styles.pad}
              style={{ width: `var(--meta-w, ${own ? 62 : 40}px)` }}
              aria-hidden="true"
            />
          </span>
          <MessageMeta createdAt={message.createdAt} own={own} edited={Boolean(message.editedAt)} status={status} read={read} />
        </span>
        {children}
      </div>
    );
  }

  const classes = [styles.bubble, own ? styles.out : styles.in, message.status === 'failed' ? styles.failed : ''].join(
    ' ',
  );

  if (message.announcement && !message.deletedAt) {
    return (
      <div className={classes}>
        <AnnouncementBubble announcement={message.announcement} createdAt={message.createdAt} />
        {children}
      </div>
    );
  }

  if (message.type === 'CALL' && message.call && !message.deletedAt) {
    return (
      <div className={classes}>
        <CallMessage call={message.call} own={own} createdAt={message.createdAt} />
        {children}
      </div>
    );
  }

  return (
    <div className={classes}>
      {showAuthor && message.sender && (
        <span className={styles.author} style={{ ['--author-tint' as string]: tintVar(message.sender.id) }}>
          {message.sender.displayName}
        </span>
      )}

      {message.forwardedFrom && (
        <span className={styles.forwarded}>
          <Icon name="forward" size={13} />
          Переслано от {message.forwardedFrom.senderName}
        </span>
      )}

      {message.replyTo && <ReplyQuote reply={message.replyTo} own={own} />}

      {message.deletedAt ? (
        <span className={styles.deleted}>Сообщение удалено</span>
      ) : (
        <>
          {isVoice && message.attachment ? (
            <VoiceMessage
              attachment={message.attachment}
              own={own}
              createdAt={message.createdAt}
              edited={Boolean(message.editedAt)}
              status={status}
              read={read}
            />
          ) : (
            <>
              {message.attachment && (
                <div className={`${styles.attachment} ${message.content ? '' : styles.attachmentOnly}`}>
                  <AttachmentView attachment={message.attachment} />
                </div>
              )}
              {message.localAttachment && (
                <div className={`${styles.attachment} ${message.content ? '' : styles.attachmentOnly}`}>
                  <LocalAttachmentPreview
                    local={message.localAttachment}
                    onCancel={() => cancelAttachmentUpload(message.chatId, message.clientId!)}
                    onRetry={() => retryMessage(message.chatId, message.clientId!)}
                  />
                </div>
              )}
              <span className={styles.textRow}>
                <span className={styles.text} data-selectable="true">
                  {message.content ? parseEmoji(message.content) : null}
                  <span
                    className={styles.pad}
                    style={{ width: `var(--meta-w, ${own ? 62 : 40}px)` }}
                    aria-hidden="true"
                  />
                </span>
                <MessageMeta
                  createdAt={message.createdAt}
                  own={own}
                  edited={Boolean(message.editedAt)}
                  status={status}
                  read={read}
                />
              </span>
            </>
          )}
          {status === 'failed' && !message.localAttachment && (
            <button
              type="button"
              className={styles.retryText}
              onClick={() => retryMessage(message.chatId, message.clientId!)}
            >
              <Icon name="retry" size={13} />
              Повторить
            </button>
          )}
        </>
      )}

      {children}
    </div>
  );
}
