import type { MessageAnnouncementDto } from '@messenger/shared';

import { selectUpdateAvailable, useAppUpdateStore } from '../../app/appUpdate';
import { Icon } from '../../ui/Icon';
import { MessageMeta } from '../messages/MessageMeta';
import styles from './AnnouncementBubble.module.css';

interface AnnouncementBubbleProps {
  announcement: MessageAnnouncementDto;
  createdAt: string;
}

const NOTE_TEXT = '(если не хочешь видеть оповещения об обновлениях, выключи уведомления, хз)';

/** Объявление о выпуске — единственный вид сообщения со своей кнопкой внутри пузыря.
 *  Кнопка открывает тот же UpdateModal, что и строка «Доступно обновление» в Настройках
 *  (ОБНОВЛЕНИЯ-2): второго экрана обновления в приложении нет. */
export function AnnouncementBubble({ announcement, createdAt }: AnnouncementBubbleProps) {
  const currentVersionCode = useAppUpdateStore((s) => s.currentVersionCode);
  const updateAvailable = useAppUpdateStore(selectUpdateAvailable);
  const openModal = useAppUpdateStore((s) => s.openModal);

  const installed = currentVersionCode !== null && currentVersionCode >= announcement.versionCode;
  const canUpdate = updateAvailable && !installed;

  return (
    <span className={styles.announcement}>
      <span className={styles.header}>
        <Icon name="retry" size={15} className={styles.headerIcon} />
        Версия {announcement.versionName}
      </span>

      <span className={styles.title}>Новое обновление ({announcement.versionName})!</span>

      {announcement.changelog.length > 0 && (
        <>
          <span className={styles.subtitle}>Что изменилось:</span>
          <span className={styles.list}>
            {announcement.changelog.map((line) => (
              <span key={line} className={styles.item}>
                — {line}
              </span>
            ))}
          </span>
        </>
      )}

      <span className={styles.note}>{NOTE_TEXT}</span>

      {canUpdate && (
        <button type="button" className={styles.action} onClick={openModal}>
          Обновить
        </button>
      )}
      {installed && <span className={styles.installed}>Уже установлено</span>}

      <span className={styles.metaRow}>
        <MessageMeta createdAt={createdAt} own={false} edited={false} status="sent" read={false} />
      </span>
    </span>
  );
}
