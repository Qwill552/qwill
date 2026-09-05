import { categorizeAttachment, isBlurhash, type AttachmentDto } from '@messenger/shared';
import { decode as decodeBlurhash } from 'blurhash';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { useFileSrc } from '../../api/useFileSrc';
import type { MediaKind } from '../../cache/db';
import { MEDIA_LOAD_MARGIN_PX, useMediaFeed } from './mediaFeedScope';

export function needsOriginalInList(attachment: AttachmentDto): boolean {
  return attachment.file.mimeType === 'image/gif';
}

export function useReachedViewport(ref: RefObject<Element | null>): boolean {
  const feed = useMediaFeed();
  const [reached, setReached] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || reached) return;
    if (feed) return feed.observeForLoading(node, () => setReached(true));
    if (typeof IntersectionObserver === 'undefined') {
      setReached(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setReached(true);
      },
      { rootMargin: `${MEDIA_LOAD_MARGIN_PX}px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, reached, feed]);

  return reached;
}

export function useDecodedSrc(src: string | undefined): string | undefined {
  const feed = useMediaFeed();
  const [decoded, setDecoded] = useState<string>();

  useEffect(() => {
    if (!src) {
      setDecoded(undefined);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const probe = new Image();
    probe.src = src;
    probe
      .decode()
      .then(() => {
        if (cancelled) return;
        if (feed?.isMoving()) {
          unsubscribe = feed.whenSettled(() => {
            if (!cancelled) setDecoded(src);
          });
          return;
        }
        setDecoded(src);
      })
      .catch(() => {
        if (!cancelled) setDecoded(undefined);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [src, feed]);

  return decoded;
}

export const BLURHASH_CANVAS_SIDE = 32;

export function decodeBlurhashPixels(blurhash: string | null | undefined): Uint8ClampedArray | null {
  if (!isBlurhash(blurhash)) return null;
  try {
    return decodeBlurhash(blurhash, BLURHASH_CANVAS_SIDE, BLURHASH_CANVAS_SIDE);
  } catch {
    return null;
  }
}

export function useBlurhashCanvas(blurhash: string | null | undefined): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const pixels = decodeBlurhashPixels(blurhash);
    if (!canvas || !pixels) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(BLURHASH_CANVAS_SIDE, BLURHASH_CANVAS_SIDE);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
  }, [blurhash]);

  return ref;
}

export function mediaKindOf(attachment: AttachmentDto): MediaKind {
  const kind = categorizeAttachment(attachment.file.mimeType, attachment.peaks);
  return kind === 'gif' ? 'photo' : kind;
}

export function usePreviewSrc(attachment: AttachmentDto, chatId: string | null, enabled = true): string | undefined {
  const fileId = attachment.preview?.id ?? attachment.thumbnail?.id ?? attachment.file.id;
  const hasDownscaled = Boolean(attachment.preview ?? attachment.thumbnail);
  return useFileSrc(enabled ? fileId : null, {
    tier: hasDownscaled ? 'thumb' : 'full',
    chatId,
    kind: mediaKindOf(attachment),
  });
}

export function useProgressiveSrc(
  attachment: AttachmentDto,
  ref: RefObject<Element | null>,
  chatId: string | null,
): string | undefined {
  const feed = useMediaFeed();
  const reached = useReachedViewport(ref);
  const preview = usePreviewSrc(attachment, chatId, feed === null || reached);
  const wanted = needsOriginalInList(attachment) && reached && attachment.thumbnail ? attachment.file.id : null;
  const original = useDecodedSrc(useFileSrc(wanted, { tier: 'full', chatId, kind: mediaKindOf(attachment) }));
  return original ?? preview;
}

export function mediaRatio(attachment: AttachmentDto): number | null {
  if (!attachment.width || !attachment.height) return null;
  return attachment.width / attachment.height;
}

export function useViewerSrc(
  attachment: AttachmentDto,
  wantOriginal: boolean,
  chatId: string | null,
): string | undefined {
  const preview = usePreviewSrc(attachment, chatId);
  const wanted = wantOriginal && attachment.thumbnail ? attachment.file.id : null;
  const original = useDecodedSrc(useFileSrc(wanted, { tier: 'full', chatId, kind: mediaKindOf(attachment) }));
  return original ?? preview;
}
