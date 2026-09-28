import type { MessageDto } from '@messenger/shared';

import { Icon } from '../../ui/Icon';
import { isVoiceAttachment } from './Attachment';
import styles from './PinnedBanner.module.css';

function previewText(message: MessageDto): string {
  if (message.content) return message.content;
  if (message.attachment) {
    const isVoice = isVoiceAttachment(message.attachment) || message.attachment.file.mimeType.startsWith('audio/');
    return isVoice ? 'Голосовое сообщение' : 'Вложение';
  }
  return '';
}

interface PinnedBannerProps {
  message: MessageDto;
  canUnpin: boolean;
  onJump: () => void;
  onClose: () => void;
}

/** Баннер закреплённого сообщения — липнет к верху ленты (этап 6, «Закрепить» из
 *  контекстного меню). Вёрстка — буквальный перенос референса (скриншот пользователя):
 *  полоса-акцент слева + подпись/превью в две строки, без карточки и иконки булавки.
 *  Тап уводит к сообщению. */
export function PinnedBanner({ message, canUnpin, onJump, onClose }: PinnedBannerProps) {
  return (
    <div className={styles.banner}>
      <button type="button" className={styles.body} onClick={onJump}>
        <span className={styles.bar} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.label}>Закреплённое сообщение</span>
          <span className={styles.preview}>{previewText(message)}</span>
        </span>
      </button>
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label={canUnpin ? 'Открепить' : 'Скрыть закреп'}
        title={canUnpin ? 'Открепить' : 'Скрыть закреп'}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
