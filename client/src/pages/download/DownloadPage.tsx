import { DEVICE_PLACEHOLDER } from './config';
import { CONTENT } from './content';
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
        <PageHeader />
        <OsSwitch os={os} onChange={setOs} />
        <div
          className={styles.demoStub}
          style={{ aspectRatio: `${DEVICE_PLACEHOLDER.width} / ${DEVICE_PLACEHOLDER.height}` }}
          aria-hidden="true"
        >
          {CONTENT.demoPlaceholder}
        </div>
        <DownloadButton release={release} />
        <ReleaseInfo os={os} release={release} />
      </div>
    </div>
  );
}
