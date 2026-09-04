import { useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';

import { useFileSrc } from '../../api/useFileSrc';
import { useLinkPreviewStore } from '../../stores/linkPreviewStore';
import { fileIdFromUrl } from '../../ui/Avatar';
import styles from './LinkPreviewCard.module.css';

const STICK_BOTTOM_PX = 120;

interface LinkPreviewCardProps {
  url: string;
  own: boolean;
  onLinkClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function LinkPreviewCard({ url, own, onLinkClick }: LinkPreviewCardProps) {
  const preview = useLinkPreviewStore((state) => state.previews[url]);
  const request = useLinkPreviewStore((state) => state.request);
  const slotRef = useRef<HTMLSpanElement>(null);

  const ready = preview?.status === 'ready' ? preview : null;
  const imageSrc = useFileSrc(ready?.imageUrl ? fileIdFromUrl(ready.imageUrl) : null, 'full');

  useEffect(() => {
    const node = slotRef.current;
    if (!node || preview) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      request(url);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [url, preview, request]);

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

  const title = ready?.title ?? null;
  const description = ready?.description ?? null;
  const siteName = ready?.siteName ?? null;
  const empty = ready !== null && !title && !description && !siteName && !ready.imageUrl;

  return (
    <span ref={slotRef} className={`${styles.slot} ${ready && !empty ? styles.slotFilled : ''}`}>
      {ready && !empty && (
        <a
          className={`${styles.card} ${own ? styles.onOut : ''}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={onLinkClick}
        >
          {siteName && <span className={styles.site}>{siteName}</span>}
          {title && <span className={styles.title}>{title}</span>}
          {description && <span className={styles.description}>{description}</span>}
          {ready.imageUrl && (
            <span className={styles.imageBox}>
              {imageSrc && <img className={styles.image} src={imageSrc} alt="" loading="lazy" />}
            </span>
          )}
        </a>
      )}
    </span>
  );
}
