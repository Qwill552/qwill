import { DEVICE_PLACEHOLDER } from './config';
import { CONTENT } from './content';
import styles from './DownloadPage.module.css';
import { PageHeader } from './header/PageHeader';
import './tokens.download.css';

export function DownloadPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <PageHeader />
        <div className={styles.osSwitchStub} aria-hidden="true" />
        <div
          className={styles.demoStub}
          style={{ aspectRatio: `${DEVICE_PLACEHOLDER.width} / ${DEVICE_PLACEHOLDER.height}` }}
          aria-hidden="true"
        >
          {CONTENT.demoPlaceholder}
        </div>
        <div className={styles.downloadButtonStub} aria-hidden="true" />
        <div className={styles.versionStub} aria-hidden="true" />
      </div>
    </div>
  );
}
