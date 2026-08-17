import type { AppVersionInfo } from '@messenger/shared';
import { useEffect, useState } from 'react';

import { apkDownloadUrl, fetchAppVersion } from '../api/appVersion';
import { AmbientBlobs } from '../app/AmbientBlobs';
import { formatBytes } from '../features/messages/Attachment';
import { Icon } from '../ui/Icon';
import styles from './DownloadScreen.module.css';

/** Заглушка страницы раздачи: пока это только Android-APK. Полноценная страница загрузок
 *  под несколько платформ — отдельный шаг, см. updates.md. */
export function DownloadScreen() {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchAppVersion()
      .then(setInfo)
      .catch(() => setInfo(null))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className={styles.screen}>
      <AmbientBlobs />
      <main className={styles.body}>
        <h1 className={styles.title}>Qwill</h1>
        <p className={styles.subtitle}>Мессенджер для тех, кому важно, как он ощущается</p>

        <section className={styles.card}>
          <span className={styles.platformIcon}>
            <Icon name="phone" size={24} />
          </span>
          <div className={styles.platformBody}>
            <h2 className={styles.platformTitle}>Android</h2>
            {info ? (
              <p className={styles.platformMeta}>
                Версия {info.versionName} · {formatBytes(info.sizeBytes)}
              </p>
            ) : (
              <p className={styles.platformMeta}>{loaded ? 'Выпуск пока не опубликован' : 'Загрузка…'}</p>
            )}
          </div>
          {info && (
            <a className={styles.downloadButton} href={apkDownloadUrl(info)}>
              Скачать
            </a>
          )}
        </section>

        {info && info.changelog.length > 0 && (
          <section className={styles.changelogBlock}>
            <h2 className={styles.changelogTitle}>Что нового</h2>
            <ul className={styles.changelog}>
              {info.changelog.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.card}>
          <span className={styles.platformIcon}>
            <Icon name="monitor" size={24} />
          </span>
          <div className={styles.platformBody}>
            <h2 className={styles.platformTitle}>Windows, macOS, iOS</h2>
            <p className={styles.platformMeta}>Появятся позже</p>
          </div>
        </section>

        <p className={styles.hint}>
          Android спросит разрешение на установку приложения из браузера — это обычный шаг для приложений вне
          Google Play. Дальше Qwill будет обновляться сам, изнутри приложения.
        </p>

        <a className={styles.webLink} href="/">
          Открыть Qwill в браузере
        </a>
      </main>
    </div>
  );
}
