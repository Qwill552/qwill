import { createContext, useContext, useEffect, useState, type RefObject } from 'react';

export const MEDIA_LOAD_MARGIN_PX = 300;
export const MEDIA_LOAD_THROTTLE_MS = 700;
export const MEDIA_SETTLE_MS = 150;

export interface MediaFeedScope {
  observeForLoading(node: Element, onVisible: () => void): () => void;
  whenSettled(run: () => void): () => void;
  isMoving(): boolean;
}

export interface MediaFeedScopeHandle extends MediaFeedScope {
  dispose(): void;
}

interface Watched {
  onVisible: () => void;
  visible: boolean;
}

export function createMediaFeedScope(root: Element): MediaFeedScopeHandle | null {
  if (typeof IntersectionObserver === 'undefined') return null;

  const watched = new Map<Element, Watched>();
  const settleQueue = new Set<() => void>();
  let flushTimer = 0;
  let moveTimer = 0;
  let moving = false;

  function flush(): void {
    window.clearTimeout(flushTimer);
    flushTimer = 0;
    for (const [node, watch] of [...watched]) {
      if (!watch.visible) continue;
      watched.delete(node);
      observer.unobserve(node);
      watch.onVisible();
    }
  }

  function schedule(): void {
    if (!moving) {
      flush();
      return;
    }
    if (flushTimer === 0) flushTimer = window.setTimeout(flush, MEDIA_LOAD_THROTTLE_MS);
  }

  function settle(): void {
    moveTimer = 0;
    moving = false;
    flush();
    const queued = [...settleQueue];
    settleQueue.clear();
    for (const run of queued) run();
  }

  function handleScroll(): void {
    moving = true;
    window.clearTimeout(moveTimer);
    moveTimer = window.setTimeout(settle, MEDIA_SETTLE_MS);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const watch = watched.get(entry.target);
        if (watch) watch.visible = entry.isIntersecting;
      }
      schedule();
    },
    { root, rootMargin: `${MEDIA_LOAD_MARGIN_PX}px` },
  );

  root.addEventListener('scroll', handleScroll, { passive: true });

  return {
    observeForLoading(node, onVisible) {
      watched.set(node, { onVisible, visible: false });
      observer.observe(node);
      return () => {
        watched.delete(node);
        observer.unobserve(node);
      };
    },
    whenSettled(run) {
      settleQueue.add(run);
      return () => {
        settleQueue.delete(run);
      };
    },
    isMoving: () => moving,
    dispose() {
      root.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      watched.clear();
      settleQueue.clear();
      window.clearTimeout(flushTimer);
      window.clearTimeout(moveTimer);
    },
  };
}

export const MediaFeedContext = createContext<MediaFeedScope | null>(null);

export function useMediaFeed(): MediaFeedScope | null {
  return useContext(MediaFeedContext);
}

export function useMediaFeedScope(rootRef: RefObject<Element | null>): MediaFeedScope | null {
  const [scope, setScope] = useState<MediaFeedScope | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const handle = root ? createMediaFeedScope(root) : null;
    setScope(handle);
    return () => {
      setScope(null);
      handle?.dispose();
    };
  }, [rootRef]);

  return scope;
}
