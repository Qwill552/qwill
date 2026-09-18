import { PHONE_LOGICAL } from './config';
import { CONTENT } from './content';
import { DemoStage } from './demo/DemoStage';
import { LockScreen } from './demo/LockScreen';
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
        {os === 'android' ? (
          <DemoStage>
            <LockScreen />
          </DemoStage>
        ) : (
          <div
            className={styles.demoStub}
            style={{ aspectRatio: `${PHONE_LOGICAL.width} / ${PHONE_LOGICAL.height}` }}
            aria-hidden="true"
          >
            {CONTENT.demoPlaceholder}
          </div>
        )}
        <DownloadButton release={release} />
        <ReleaseInfo os={os} release={release} />
      </div>
    </div>
  );
}
