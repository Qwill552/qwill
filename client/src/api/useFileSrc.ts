import { useEffect, useState } from 'react';

import { acquireObjectUrl, peekObjectUrl, releaseObjectUrl, retainObjectUrl } from '../cache/objectUrls';
import { buildFileSrc, getFileToken } from './files';

export type FileSrcTier = 'thumb' | 'full' | 'stream';

export function useFileSrc(fileId: string | null | undefined, tier: FileSrcTier = 'full'): string | undefined {
  const [src, setSrc] = useState<string | undefined>(() =>
    fileId && tier !== 'stream' ? peekObjectUrl(fileId) : undefined,
  );

  useEffect(() => {
    if (!fileId) {
      setSrc(undefined);
      return;
    }

    let cancelled = false;

    if (tier === 'stream') {
      void getFileToken(fileId)
        .then((token) => {
          if (!cancelled) setSrc(buildFileSrc(fileId, token));
        })
        .catch(() => {
          if (!cancelled) setSrc(undefined);
        });
      return () => {
        cancelled = true;
      };
    }

    const ready = retainObjectUrl(fileId);
    if (ready) {
      setSrc(ready);
      return () => releaseObjectUrl(fileId);
    }

    setSrc(undefined);
    let held = false;

    void acquireObjectUrl(fileId, tier).then((url) => {
      if (!url) return;
      if (cancelled) {
        releaseObjectUrl(fileId);
        return;
      }
      held = true;
      setSrc(url);
    });

    return () => {
      cancelled = true;
      if (held) releaseObjectUrl(fileId);
    };
  }, [fileId, tier]);

  return src;
}
