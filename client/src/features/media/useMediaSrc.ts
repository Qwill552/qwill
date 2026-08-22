import type { AttachmentDto } from '@messenger/shared';
import { useEffect, useState, type RefObject } from 'react';

import { useFileSrc } from '../../api/useFileSrc';

const ORIGINAL_PRELOAD_MARGIN = '300px';

export function useReachedViewport(ref: RefObject<Element | null>): boolean {
  const [reached, setReached] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || reached) return;
    if (typeof IntersectionObserver === 'undefined') {
      setReached(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setReached(true);
      },
      { rootMargin: ORIGINAL_PRELOAD_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, reached]);

  return reached;
}

export function useDecodedSrc(src: string | undefined): string | undefined {
  const [decoded, setDecoded] = useState<string>();

  useEffect(() => {
    if (!src) {
      setDecoded(undefined);
      return;
    }
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setDecoded(src);
    };
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return decoded;
}

export function usePreviewSrc(attachment: AttachmentDto): string | undefined {
  return useFileSrc(attachment.thumbnail?.id ?? attachment.file.id, attachment.thumbnail ? 'thumb' : 'full');
}

export function useProgressiveSrc(
  attachment: AttachmentDto,
  ref: RefObject<Element | null>,
  wantOriginal: boolean,
): string | undefined {
  const reached = useReachedViewport(ref);
  const preview = usePreviewSrc(attachment);
  const wanted = wantOriginal && reached && attachment.thumbnail ? attachment.file.id : null;
  const original = useDecodedSrc(useFileSrc(wanted, 'full'));
  return original ?? preview;
}

export function mediaRatio(attachment: AttachmentDto): number | null {
  if (!attachment.width || !attachment.height) return null;
  return attachment.width / attachment.height;
}

export function useOriginalSrc(attachment: AttachmentDto): string | undefined {
  const preview = usePreviewSrc(attachment);
  const original = useDecodedSrc(useFileSrc(attachment.file.id, 'full'));
  return original ?? preview;
}
