import { useEffect, useState } from 'react';

import { resolveMedia } from '../cache/mediaCache';
import { buildFileSrc, fetchFileToken } from './files';

export type FileSrcTier = 'thumb' | 'full' | 'stream';

const tokenCache = new Map<string, string>();

async function resolveStreamUrl(fileId: string): Promise<string | undefined> {
  const cached = tokenCache.get(fileId);
  if (cached) return buildFileSrc(fileId, cached);

  try {
    const token = await fetchFileToken(fileId);
    tokenCache.set(fileId, token);
    return buildFileSrc(fileId, token);
  } catch {
    return undefined;
  }
}

export function useFileSrc(fileId: string | null | undefined, tier: FileSrcTier = 'full'): string | undefined {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!fileId) {
      setSrc(undefined);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;

    if (tier === 'stream') {
      void resolveStreamUrl(fileId).then((url) => {
        if (!cancelled) setSrc(url);
      });
    } else {
      void resolveMedia(fileId, tier).then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      });
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, tier]);

  return src;
}
