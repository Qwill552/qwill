import { useEffect, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { Skeleton } from '../../../ui/Skeleton';
import { CONTENT } from '../content';
import type { ReleaseInfo } from '../useRelease';
import styles from './DownloadButton.module.css';

interface DownloadButtonProps {
  release: ReleaseInfo;
}

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function DownloadButton({ release }: DownloadButtonProps) {
  const [pressed, setPressed] = useState(false);
  const isReady = release.state === 'ready';

  useEffect(() => {
    if (!pressed) return;
    function releasePress() {
      setPressed(false);
    }
    window.addEventListener('pointerup', releasePress);
    window.addEventListener('pointercancel', releasePress);
    return () => {
      window.removeEventListener('pointerup', releasePress);
      window.removeEventListener('pointercancel', releasePress);
    };
  }, [pressed]);

  function handlePointerDown(event: PointerEvent<HTMLAnchorElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    setPressed(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      setPressed(true);
      return;
    }
    if (event.key === 'Enter') setPressed(true);
  }

  function handleKeyUp(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key === ' ' || event.key === 'Spacebar') {
      setPressed(false);
      event.currentTarget.click();
      return;
    }
    if (event.key === 'Enter') setPressed(false);
  }

  let meta: ReactNode;
  if (release.state === 'loading') {
    meta = <Skeleton width={150} height={14} />;
  } else if (isReady) {
    meta = `${release.format} · ${release.sizeLabel} · ${CONTENT.downloadButton.versionPrefix} ${release.versionName}`;
  } else {
    meta = CONTENT.downloadButton.unavailable;
  }

  return (
    <div className={styles.wrap}>
      <span className={cx(styles.lift, pressed && styles.pressed)} aria-hidden="true" />
      {isReady ? (
        <a
          className={cx(styles.button, pressed && styles.pressed)}
          href={release.fileUrl ?? undefined}
          download
          onPointerDown={handlePointerDown}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
        >
          <span className={styles.label}>{CONTENT.downloadButton.cta}</span>
          <span className={styles.meta}>{meta}</span>
        </a>
      ) : (
        <div className={cx(styles.button, styles.disabled)} aria-disabled="true">
          <span className={styles.label}>{CONTENT.downloadButton.cta}</span>
          <span className={styles.meta}>{meta}</span>
        </div>
      )}
      {release.state === 'offline' && <p className={styles.notice}>{CONTENT.downloadButton.offlineNotice}</p>}
    </div>
  );
}
