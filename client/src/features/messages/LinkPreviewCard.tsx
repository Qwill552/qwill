import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import type { LinkPreviewDto } from '@messenger/shared';

import { useFileSrc } from '../../api/useFileSrc';
import { useLinkPreviewStore } from '../../stores/linkPreviewStore';
import { fileIdFromUrl } from '../../ui/Avatar';
import styles from './LinkPreviewCard.module.css';

const STICK_BOTTOM_PX = 120;

export function useRenderableLinkPreview(url: string | null): LinkPreviewDto | null {
  const preview = useLinkPreviewStore((state) => (url ? state.previews[url] : undefined));
  if (!preview || preview.status !== 'ready') return null;
  if (!preview.siteName && !preview.title && !preview.description && !preview.imageUrl) return null;
  return preview;
}

interface LinkPreviewCardProps {
  url: string;
  own: boolean;
  onLinkClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  meta?: ReactNode;
}

export function LinkPreviewCard({ url, own, onLinkClick, meta }: LinkPreviewCardProps) {
  const known = useLinkPreviewStore((state) => state.previews[url]);
  const request = useLinkPreviewStore((state) => state.request);
  const ready = useRenderableLinkPreview(url);
  const slotRef = useRef<HTMLSpanElement>(null);

  const imageSrc = useFileSrc(ready?.imageUrl ? fileIdFromUrl(ready.imageUrl) : null, { tier: 'full' });

  useEffect(() => {
    const node = slotRef.current;
    if (!node || known) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      request(url);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [url, known, request]);

  useLayoutEffect(() => {
    const node = slotRef.current;
    const list = node?.closest<HTMLElement>('[data-message-scroller]');
    if (!node || !list) return;
    let last = node.getBoundingClientRect().height;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.borderBoxSize?.[0]?.blockSize;
      if (height === undefined) return;
      const delta = height - last;
      last = height;
      if (delta === 0) return;
      if (list.scrollHeight - delta - list.scrollTop - list.clientHeight < STICK_BOTTOM_PX) {
        list.scrollTop = list.scrollHeight;
        return;
      }
      if (node.getBoundingClientRect().bottom <= list.getBoundingClientRect().top) list.scrollTop += delta;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={slotRef} className={`${styles.slot} ${ready ? styles.slotFilled : ''}`}>
      {ready && (
        <a
          className={`${styles.card} ${own ? styles.onOut : ''}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={onLinkClick}
        >
          {ready.siteName && <span className={styles.site}>{ready.siteName}</span>}
          {ready.title && <span className={styles.title}>{ready.title}</span>}
          {ready.description && <span className={styles.description}>{ready.description}</span>}
          {ready.imageUrl && (
            <span className={styles.imageBox}>
              {imageSrc && <img className={styles.image} src={imageSrc} alt="" loading="lazy" />}
            </span>
          )}
        </a>
      )}
      {ready && meta && <span className={styles.metaRow}>{meta}</span>}
    </span>
  );
}
