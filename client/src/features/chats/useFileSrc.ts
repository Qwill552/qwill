import { useEffect, useState } from 'react';

import { buildFileSrc, fetchFileToken } from '../../api/files';

// Токен живёт час на сервере — кэш на вкладку, чтобы не дёргать /token на каждый ре-рендер (секция 7).
const tokenCache = new Map<string, string>();

/** Резолвит fileId в src для <img>/<video> через короткоживущий токен — Bearer-заголовок им не передать. */
export function useFileSrc(fileId: string | null | undefined): string | undefined {
  const [src, setSrc] = useState<string | undefined>(() => {
    if (!fileId) return undefined;
    const cached = tokenCache.get(fileId);
    return cached ? buildFileSrc(fileId, cached) : undefined;
  });

  useEffect(() => {
    if (!fileId) {
      setSrc(undefined);
      return;
    }

    const cached = tokenCache.get(fileId);
    if (cached) {
      setSrc(buildFileSrc(fileId, cached));
      return;
    }

    let cancelled = false;
    fetchFileToken(fileId)
      .then((token) => {
        if (cancelled) return;
        tokenCache.set(fileId, token);
        setSrc(buildFileSrc(fileId, token));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return src;
}
