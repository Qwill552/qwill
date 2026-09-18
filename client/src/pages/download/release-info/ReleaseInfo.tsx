import { useEffect, useId, useState } from 'react';

import { Icon } from '../../../ui/Icon';
import { CONTENT } from '../content';
import type { OsChoice } from '../useOsChoice';
import type { ReleaseInfo as ReleaseData } from '../useRelease';
import styles from './ReleaseInfo.module.css';

interface ReleaseInfoProps {
  os: OsChoice;
  release: ReleaseData;
}

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function ReleaseInfo({ os, release }: ReleaseInfoProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [os]);

  if (release.state !== 'ready' || release.changelog.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={cx(styles.label, open && styles.labelOpen)}>
          {CONTENT.releaseInfo.versionPrefix} {release.versionName} · {CONTENT.releaseInfo.whatsNew}
        </span>
        <Icon name="chevron-down" size={16} className={cx(styles.chevron, open && styles.chevronOpen)} />
      </button>
      <div id={panelId} className={cx(styles.panel, open && styles.panelOpen)}>
        <div className={styles.panelInner}>
          <ul className={cx(styles.content, open && styles.contentOpen)}>
            {release.changelog.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
