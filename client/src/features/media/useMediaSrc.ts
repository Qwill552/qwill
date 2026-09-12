import { categorizeAttachment, isBlurhash, type AttachmentDto } from '@messenger/shared';
import { decode as decodeBlurhash } from 'blurhash';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { useFileSrc } from '../../api/useFileSrc';
import type { MediaKind } from '../../cache/db';
import { cancelMediaDownload, hasCachedMedia } from '../../cache/mediaCache';
import { readAutoDownloadSettings, shouldAutoDownload, type AutoDownloadKind } from '../../cache/settings';
import { getNetworkKind, getSaveData } from '../../net/connection';
import { scrollParentOf } from '../../ui/scrollParent';
import { feedFileIdOf, feedUsesDownscaled } from './feedQuality';
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
      { root: scrollParentOf(node), rootMargin: `${MEDIA_LOAD_MARGIN_PX}px` },
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

function autoDownloadKindOf(attachment: AttachmentDto): AutoDownloadKind | null {
  const kind = categorizeAttachment(attachment.file.mimeType, attachment.peaks);
  return kind === 'photo' || kind === 'video' || kind === 'gif' || kind === 'file' ? kind : null;
}

interface AutoDownloadGate {
  ready: boolean;
  allowed: boolean;
  manual: boolean;
  requestDownload: () => void;
  cancelDownload: () => void;
}

function useAutoDownloadGate(attachment: AttachmentDto, previewFileId: string): AutoDownloadGate {
  const kind = autoDownloadKindOf(attachment);
  const [ready, setReady] = useState(kind === null);
  const [allowed, setAllowed] = useState(kind === null);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (kind === null) {
      setReady(true);
      setAllowed(true);
      return;
    }

    let cancelled = false;
    setReady(false);
    setManual(false);

    const cacheCheckId = kind === 'gif' ? attachment.file.id : previewFileId;

    void Promise.all([hasCachedMedia(cacheCheckId), readAutoDownloadSettings()]).then(([cached, settings]) => {
      if (cancelled) return;

      const network = getNetworkKind();
      setAllowed(
        shouldAutoDownload({
          kind,
          network: network === 'cellular' ? 'cellular' : 'wifi',
          sizeBytes: attachment.file.size,
          cached,
          saveData: getSaveData(),
          settings,
        }),
      );
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [kind, previewFileId, attachment.file.id, attachment.file.size]);

  return {
    ready,
    allowed,
    manual,
    requestDownload: () => setManual(true),
    cancelDownload: () => {
      setManual(false);
      cancelMediaDownload(previewFileId);
      if (kind === 'gif') cancelMediaDownload(attachment.file.id);
    },
  };
}

export function usePreviewSrc(attachment: AttachmentDto, chatId: string | null, enabled = true): string | undefined {
  return useFileSrc(enabled ? feedFileIdOf(attachment) : null, {
    tier: feedUsesDownscaled(attachment) ? 'thumb' : 'full',
    chatId,
    kind: mediaKindOf(attachment),
  });
}

export interface ProgressiveMedia {
  src: string | undefined;
  blocked: boolean;
  downloading: boolean;
  sizeBytes: number;
  requestDownload: () => void;
  cancelDownload: () => void;
}

export function useProgressiveSrc(
  attachment: AttachmentDto,
  ref: RefObject<Element | null>,
  chatId: string | null,
): ProgressiveMedia {
  const feed = useMediaFeed();
  const reached = useReachedViewport(ref);
  const previewFileId = feedFileIdOf(attachment);
  const gate = useAutoDownloadGate(attachment, previewFileId);
  const unlocked = gate.allowed || gate.manual;

  const preview = usePreviewSrc(attachment, chatId, (feed === null || reached) && unlocked);
  const wanted =
    unlocked && needsOriginalInList(attachment) && reached && attachment.thumbnail ? attachment.file.id : null;
  const rawOriginal = useFileSrc(wanted, { tier: 'full', chatId, kind: mediaKindOf(attachment) });
  const original = useDecodedSrc(rawOriginal);

  return {
    src: original ?? preview,
    blocked: reached && gate.ready && !unlocked,
    downloading: gate.manual && !(rawOriginal ?? preview),
    sizeBytes: attachment.file.size,
    requestDownload: gate.requestDownload,
    cancelDownload: gate.cancelDownload,
  };
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
