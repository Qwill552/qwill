import type { MessageAnnouncementDto } from '@messenger/shared';

import { isApkUpdateSupported, selectUpdateAvailable, useAppUpdateStore } from '../../app/appUpdate';
import { useDesktopUpdateStore } from '../../app/desktopUpdate';
import { isDesktopShell } from '../../native/desktop';
import { Icon } from '../../ui/Icon';
import { MessageMeta } from '../messages/MessageMeta';
import styles from './AnnouncementBubble.module.css';

interface AnnouncementBubbleProps {
  announcement: MessageAnnouncementDto;
  createdAt: string;
}

const DESKTOP_HINT = 'Перезапусти приложение и нажми «Обновить Qwill»';
const NEWS_TITLE = 'Что нового в Qwill';

function isNewerVersion(candidate: string, current: string): boolean {
  const left = candidate.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = current.split('.').map((part) => Number.parseInt(part, 10) || 0);

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/** Объявление о выпуске — единственный вид сообщения со своим действием внутри пузыря.
 *  Список изменений один на все платформы, а что человеку делать дальше, зависит от того,
 *  где открыт клиент: на Android кнопка, открывающая тот же UpdateModal, что и строка в
 *  Настройках (ОБНОВЛЕНИЯ-2), в оболочке — строка про «Обновить Qwill», в вебе ничего:
 *  там обновление долетает само (D-12). */
export function AnnouncementBubble({ announcement, createdAt }: AnnouncementBubbleProps) {
  const currentVersionCode = useAppUpdateStore((s) => s.currentVersionCode);
  const updateAvailable = useAppUpdateStore(selectUpdateAvailable);
  const openModal = useAppUpdateStore((s) => s.openModal);
  const desktopVersion = useDesktopUpdateStore((s) => s.currentVersion);

  const { androidVersionCode, androidVersionName, windowsVersionName } = announcement;
  const platform = isDesktopShell() ? 'windows' : isApkUpdateSupported() ? 'android' : 'web';

  const androidInstalled =
    androidVersionCode !== null && currentVersionCode !== null && currentVersionCode >= androidVersionCode;
  const windowsInstalled =
    windowsVersionName !== null && desktopVersion !== null && !isNewerVersion(windowsVersionName, desktopVersion);

  const showButton = platform === 'android' && androidVersionCode !== null && updateAvailable && !androidInstalled;
  const showHint = platform === 'windows' && windowsVersionName !== null && !windowsInstalled;
  const showInstalled =
    (platform === 'android' && androidInstalled) || (platform === 'windows' && windowsInstalled);

  const version = platform === 'windows' ? windowsVersionName : platform === 'android' ? androidVersionName : null;

  return (
    <span className={styles.announcement}>
      <span className={styles.header}>
        <Icon name="retry" size={15} className={styles.headerIcon} />
        {version === null ? NEWS_TITLE : `Версия ${version}`}
      </span>

      <span className={styles.title}>{version === null ? NEWS_TITLE : `Новое обновление (${version})!`}</span>

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

      {showButton && (
        <button type="button" className={styles.action} onClick={openModal}>
          Обновить
        </button>
      )}
      {showHint && <span className={styles.hint}>{DESKTOP_HINT}</span>}
      {showInstalled && <span className={styles.installed}>Уже установлено</span>}

      <span className={styles.metaRow}>
        <MessageMeta createdAt={createdAt} own={false} edited={false} status="sent" read={false} />
      </span>
    </span>
  );
}
