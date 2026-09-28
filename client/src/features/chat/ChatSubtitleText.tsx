import { useEffect, useState } from 'react';

import { titleDelayMs, titleKindOf, useConnectionStatus, type TitleKind } from '../../realtime/connectionStatus';
import { LiveEllipsis } from '../../ui/LiveEllipsis';
import type { Subtitle } from './chatSubtitle';
import styles from './ChatSubtitleText.module.css';

export function useShownConnectionKind(): TitleKind {
  const target = useConnectionStatus(titleKindOf);
  const [shown, setShown] = useState<TitleKind>(() => (titleDelayMs(target) > 0 ? 'brand' : target));

  useEffect(() => {
    const timer = setTimeout(() => setShown(target), titleDelayMs(target));
    return () => clearTimeout(timer);
  }, [target]);

  return shown;
}

export function ChatSubtitleText({ subtitle }: { subtitle: Subtitle }) {
  return (
    <>
      {subtitle.typing && (
        <span className={styles.typingDots} aria-hidden="true">
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </span>
      )}
      {subtitle.text}
      {subtitle.dots && <LiveEllipsis />}
    </>
  );
}
