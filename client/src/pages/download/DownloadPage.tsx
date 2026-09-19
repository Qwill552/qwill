import { DemoStage } from './demo/DemoStage';
import { DownloadButton } from './download-button/DownloadButton';
import styles from './DownloadPage.module.css';
import { PageHeader } from './header/PageHeader';
import { OsSwitch } from './os-switch/OsSwitch';
import { ReleaseInfo } from './release-info/ReleaseInfo';
import './tokens.download.css';
import { useOsChoice } from './useOsChoice';
import { useRelease } from './useRelease';

export function DownloadPage() {
  const { os, setOs } = useOsChoice();
  const release = useRelease(os);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.narrow}>
          <PageHeader />
        </div>
        <div className={styles.narrow}>
          <OsSwitch os={os} onChange={setOs} />
        </div>
        <div className={styles.demo}>
          <DemoStage os={os} />
        </div>
        <div className={styles.narrow}>
          <DownloadButton release={release} />
        </div>
        <div className={styles.narrow}>
          <ReleaseInfo os={os} release={release} />
        </div>
      </div>
    </div>
  );
}
