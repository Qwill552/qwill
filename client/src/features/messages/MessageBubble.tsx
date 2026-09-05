import { splitTextWithLinks } from '@messenger/shared';
import { Fragment, type MouseEvent, type ReactNode } from 'react';

import { type LocalMessage, useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { tintVar } from '../../ui/tint';
import { AnnouncementBubble } from '../chat/AnnouncementBubble';
import { Emoji } from '../emoji/Emoji';
import { emojiOnlyContent, parseEmoji } from '../emoji/parseEmoji';
import { albumTiles, MediaGrid } from '../media/MediaGrid';
import { isViewableMedia } from '../media/mediaKind';
import { VoiceMessage } from '../voice/VoiceMessage';
import { AttachmentView, isVoiceAttachment, LocalAttachmentPreview } from './Attachment';
import { CallMessage } from './CallMessage';
import { LinkPreviewCard, useRenderableLinkPreview } from './LinkPreviewCard';
import { MessageMeta } from './MessageMeta';
import { ReplyQuote } from './ReplyQuote';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: LocalMessage;
  own: boolean;
  read: boolean;
  /** Показывать имя автора (группа, первое сообщение серии). */
  showAuthor: boolean;
  album?: LocalMessage[];
  /** Чипы реакций и прочее, что рисуется под текстом внутри пузыря. */
  children?: ReactNode;
}

/** Буквально из референса (строка 332): фиксированный радиус 20/20/7/20 (свои) или
 *  20/20/20/7 (чужие) — без поджатия углов в сериях, без хвостиков. Метаданные —
 *  абсолютом в правом нижнем углу (строка 333), текст резервирует под них место
 *  невидимой распоркой после себя (строка 339: `{{ m.pad }}`), а не float. */
export function MessageBubble({ message, own, read, showAuthor, album, children }: MessageBubbleProps) {
  const status: 'sending' | 'sent' | 'failed' =
    message.status === 'sending' ? 'sending' : message.status === 'failed' ? 'failed' : 'sent';
  const isVoice = message.attachment !== null && isVoiceAttachment(message.attachment);
  const localMedia = message.localAttachment?.kind === 'image' || message.localAttachment?.kind === 'video';
  const hasVisualMedia =
    !isVoice && !message.deletedAt && (!!album || localMedia || (!!message.attachment && isViewableMedia(message.attachment)));
  const hasHeader = Boolean((showAuthor && message.sender) || message.forwardedFrom || message.replyTo);
  const bareMedia = hasVisualMedia && !message.content;
  const hasAttachment = Boolean(album || message.attachment || message.localAttachment);
  const fileOnly = hasAttachment && !hasVisualMedia && !isVoice && !message.deletedAt && !message.content;

  const bare =
    !showAuthor &&
    !message.forwardedFrom &&
    !message.replyTo &&
    !message.attachment &&
    !message.localAttachment &&
    !message.deletedAt;
  const retryMessage = useChatStore((s) => s.retryMessage);
  const cancelMessage = useChatStore((s) => s.cancelMessage);
  const emojiOnly = bare ? emojiOnlyContent(message.content ?? '') : null;

  const spans = message.content ? splitTextWithLinks(message.content) : null;
  const firstLink = message.deletedAt ? null : (spans?.find((span) => span.kind === 'link')?.href ?? null);
  const metaUnderCard = useRenderableLinkPreview(firstLink) !== null;

  function handleLinkClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (!useChatStore.getState().selectionMode) return;
    event.preventDefault();
    useChatStore.getState().toggleSelected(message.id);
  }

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
              style={{ width: `var(--meta-w, ${own ? 68 : 46}px)` }}
              aria-hidden="true"
            />
          </span>
          <MessageMeta createdAt={message.createdAt} own={own} edited={Boolean(message.editedAt)} status={status} read={read} />
        </span>
        {children}
      </div>
    );
  }

  const inlineMeta = (
    <MessageMeta
      createdAt={message.createdAt}
      own={own}
      edited={Boolean(message.editedAt)}
      status={status}
      read={read}
      variant="inline"
    />
  );

  const classes = [
    styles.bubble,
    own ? styles.out : styles.in,
    message.status === 'failed' ? styles.failed : '',
    bareMedia && !hasHeader ? styles.bubbleBare : '',
  ].join(' ');

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

      {isVoice && message.attachment ? (
        <VoiceMessage
          attachment={message.attachment}
          own={own}
          chatId={message.chatId}
          createdAt={message.createdAt}
          edited={Boolean(message.editedAt)}
          status={status}
          read={read}
        />
      ) : (
        <>
          {hasAttachment && (
            <div
              className={
                hasVisualMedia
                  ? [styles.media, hasHeader ? styles.mediaHeaded : '', bareMedia ? styles.mediaBare : ''].join(' ')
                  : fileOnly
                    ? ''
                    : styles.fileRow
              }
            >
              {album ? (
                <MediaGrid
                  tiles={albumTiles(album)}
                  chatId={message.chatId}
                  onCancel={(clientId) => void cancelMessage(message.chatId, clientId)}
                  onRetry={(clientId) => retryMessage(message.chatId, clientId)}
                />
              ) : message.attachment ? (
                <AttachmentView attachment={message.attachment} chatId={message.chatId} meta={fileOnly ? inlineMeta : undefined} />
              ) : message.localAttachment ? (
                <LocalAttachmentPreview
                  local={message.localAttachment}
                  onCancel={() => void cancelMessage(message.chatId, message.clientId!)}
                  onRetry={() => retryMessage(message.chatId, message.clientId!)}
                  meta={fileOnly ? inlineMeta : undefined}
                />
              ) : null}

              {bareMedia && (
                <span className={styles.mediaMeta}>
                  {children}
                  <span className={styles.metaHolder}>
                    <MessageMeta
                      createdAt={message.createdAt}
                      own={own}
                      edited={Boolean(message.editedAt)}
                      status={status}
                      read={read}
                      variant="overlay"
                    />
                  </span>
                </span>
              )}
            </div>
          )}
          {!bareMedia && !fileOnly && (
            <span className={styles.textRow}>
              <span className={styles.text} data-selectable="true">
                {spans
                  ? spans.map((span, i) =>
                      span.kind === 'link' ? (
                        <a
                          key={i}
                          href={span.href!}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className={styles.link}
                          onClick={handleLinkClick}
                        >
                          {span.value}
                        </a>
                      ) : (
                        <Fragment key={i}>{parseEmoji(span.value)}</Fragment>
                      ),
                    )
                  : null}
                {!metaUnderCard && (
                  <span
                    className={styles.pad}
                    style={{ width: `var(--meta-w, ${own ? 68 : 46}px)` }}
                    aria-hidden="true"
                  />
                )}
              </span>
              {!metaUnderCard && (
                <MessageMeta
                  createdAt={message.createdAt}
                  own={own}
                  edited={Boolean(message.editedAt)}
                  status={status}
                  read={read}
                />
              )}
            </span>
          )}
          {firstLink && (
            <LinkPreviewCard
              url={firstLink}
              own={own}
              onLinkClick={handleLinkClick}
              meta={inlineMeta}
            />
          )}
        </>
      )}
      {!bareMedia && children}
    </div>
  );
}
