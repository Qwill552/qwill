import { useEffect, useState } from 'react';

import type { MediaKind, MediaTier } from '../cache/db';
import { acquireObjectUrl, peekObjectUrl, releaseObjectUrl, retainObjectUrl } from '../cache/objectUrls';
import { resolveStreamSrc } from './videoStream';

export type FileSrcTier = MediaTier | 'stream';

export interface FileSrcDescriptor {
  tier?: FileSrcTier;
  chatId?: string | null;
  kind?: MediaKind;
}

export function useFileSrc(fileId: string | null | undefined, descriptor: FileSrcDescriptor = {}): string | undefined {
  const tier = descriptor.tier ?? 'full';
  const chatId = descriptor.chatId ?? null;
  const kind = descriptor.kind ?? 'other';

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
      void resolveStreamSrc(fileId, chatId, kind === 'video')
        .then((url) => {
          if (!cancelled) setSrc(url);
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

    void acquireObjectUrl(fileId, { tier, chatId, kind }).then((url) => {
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
  }, [fileId, tier, chatId, kind]);

  return src;
}
