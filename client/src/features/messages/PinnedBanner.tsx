import type { MessageDto } from '@messenger/shared';

import { Icon } from '../../ui/Icon';
import styles from './PinnedBanner.module.css';

function previewText(message: MessageDto): string {
  if (message.deletedAt) return 'Сообщение удалено';
  if (message.content) return message.content;
  if (message.attachment) return 'Вложение';
  return '';
}

interface PinnedBannerProps {
  message: MessageDto;
  canUnpin: boolean;
  onJump: () => void;
  onUnpin: () => void;
}

/** Баннер закреплённого сообщения — липнет к верху ленты (этап 6, «Закрепить» из
 *  контекстного меню). Вёрстка — буквальный перенос референса (скриншот пользователя):
 *  полоса-акцент слева + подпись/превью в две строки, без карточки и иконки булавки.
 *  Тап уводит к сообщению, крестик снимает закреп (та же роль, что у OWNER/ADMIN на
 *  сервере — приватный чат разрешает любому участнику). */
export function PinnedBanner({ message, canUnpin, onJump, onUnpin }: PinnedBannerProps) {
  return (
    <div className={styles.banner}>
      <button type="button" className={styles.body} onClick={onJump}>
        <span className={styles.bar} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.label}>Закреплённое сообщение</span>
          <span className={styles.preview}>{previewText(message)}</span>
        </span>
      </button>
      {canUnpin && (
        <button type="button" className={styles.close} onClick={onUnpin} aria-label="Открепить" title="Открепить">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
