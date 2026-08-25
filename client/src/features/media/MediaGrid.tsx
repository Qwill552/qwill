import type { AttachmentDto } from '@messenger/shared';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { type LocalAttachmentState, type LocalMessage, useChatStore } from '../../stores/chatStore';
import { startDissolve } from '../../ui/dissolve';
import { Icon } from '../../ui/Icon';
import { cssDurationMs } from '../../ui/motion';
import { ProgressRing } from '../messages/ProgressRing';
import { MediaTile } from './MediaTile';
import { mosaicLayout, normalizeRatio, MOSAIC_MAX_ITEMS } from './mosaicLayout';
import { mediaRatio } from './useMediaSrc';
import styles from './MediaGrid.module.css';
import tileStyles from './MediaTile.module.css';

export interface AlbumTile {
  key: string;
  ratio: number | null;
  attachment: AttachmentDto | null;
  local: LocalAttachmentState | null;
  clientId: string | null;
  messageId: number | null;
}

export function albumTiles(album: LocalMessage[]): AlbumTile[] {
  return album.map((message) => ({
    key: message.clientId ?? String(message.id),
    ratio: message.attachment
      ? mediaRatio(message.attachment)
      : message.localAttachment?.width && message.localAttachment.height
        ? message.localAttachment.width / message.localAttachment.height
        : null,
    attachment: message.attachment,
    local: message.attachment ? null : (message.localAttachment ?? null),
    clientId: message.clientId,
    messageId: message.id > 0 ? message.id : null,
  }));
}

interface LeavingTile {
  tile: AlbumTile;
  index: number;
}

interface MediaGridProps {
  tiles: AlbumTile[];
  chatId: string;
  onCancel: (clientId: string) => void;
  onRetry: (clientId: string) => void;
}

/** Мозаика альбома. Удалённый снимок не выдёргивается из раскладки рывком: сперва он
 *  рассыпается в пыль на своём месте (ui/dissolve.ts), и только потом, когда плитки и
 *  правда становится меньше, оставшиеся переезжают на новые места через FLIP — обратным
 *  `transform` без пересчёта раскладки браузером на каждый кадр. */
export function MediaGrid({ tiles, chatId, onCancel, onRetry }: MediaGridProps) {
  const selectionMode = useChatStore((s) => s.selectionMode);
  const selectedIds = useChatStore((s) => s.selectedIds);
  const enterSelection = useChatStore((s) => s.enterSelection);
  const toggleSelected = useChatStore((s) => s.toggleSelected);

  const nodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const rectsRef = useRef<Map<string, DOMRect>>(new Map());
  const dissolvingRef = useRef<Map<string, () => void>>(new Map());

  // Тот же приём, что у ленты (MessageList): пропажу плитки диффим прямо в рендере, чтобы
  // React не успел снять её узел — иначе картинка загружалась бы заново вместо распада.
  const [leaving, setLeaving] = useState<Map<string, LeavingTile>>(() => new Map());
  const prevTilesRef = useRef<AlbumTile[]>(tiles);
  const previousTiles = prevTilesRef.current;
  prevTilesRef.current = tiles;

  if (previousTiles !== tiles || leaving.size > 0) {
    const liveKeys = new Set(tiles.map((tile) => tile.key));
    const gone = previousTiles.filter((tile) => !liveKeys.has(tile.key) && !leaving.has(tile.key));
    const revived = [...leaving.keys()].filter((key) => liveKeys.has(key));

    if (gone.length > 0 || revived.length > 0) {
      setLeaving((current) => {
        const next = new Map(current);
        for (const key of revived) next.delete(key);
        for (const tile of gone) next.set(tile.key, { tile, index: previousTiles.indexOf(tile) });
        return next;
      });
    }
  }

  const shown = useMemo(() => {
    if (leaving.size === 0) return tiles.slice(0, MOSAIC_MAX_ITEMS);
    const result = [...tiles];
    for (const entry of [...leaving.values()].sort((a, b) => a.index - b.index)) {
      result.splice(Math.min(entry.index, result.length), 0, entry.tile);
    }
    return result.slice(0, MOSAIC_MAX_ITEMS);
  }, [tiles, leaving]);

  const extra = Math.max(0, tiles.length - MOSAIC_MAX_ITEMS);
  const layout = mosaicLayout(shown.map((tile) => tile.ratio));
  const shownSignature = shown.map((tile) => tile.key).join('|');

  useLayoutEffect(() => {
    const cancels = dissolvingRef.current;

    for (const key of leaving.keys()) {
      if (cancels.has(key)) continue;
      const node = nodesRef.current.get(key);
      if (!node) continue;

      cancels.set(
        key,
        startDissolve(node, {
          durationMs: cssDurationMs('--dur-dissolve'),
          onDone: () => {
            cancels.delete(key);
            for (const [tileKey, tileNode] of nodesRef.current) {
              rectsRef.current.set(tileKey, tileNode.getBoundingClientRect());
            }
            setLeaving((current) => {
              if (!current.has(key)) return current;
              const next = new Map(current);
              next.delete(key);
              return next;
            });
          },
        }),
      );
    }

    for (const [key, cancel] of cancels) {
      if (leaving.has(key)) continue;
      cancel();
      cancels.delete(key);
    }
  }, [leaving]);

  useLayoutEffect(() => {
    return () => {
      for (const cancel of dissolvingRef.current.values()) cancel();
      dissolvingRef.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const prevRects = rectsRef.current;
    if (prevRects.size === 0) return;
    rectsRef.current = new Map();

    for (const [key, node] of nodesRef.current) {
      const prev = prevRects.get(key);
      if (!prev) continue;
      const rect = node.getBoundingClientRect();
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      const sx = rect.width > 0 ? prev.width / rect.width : 1;
      const sy = rect.height > 0 ? prev.height / rect.height : 1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;

      node.style.transition = 'none';
      node.style.transformOrigin = 'top left';
      node.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      void node.getBoundingClientRect();

      requestAnimationFrame(() => {
        node.style.transition = 'transform var(--dur-menu) var(--ease-screen)';
        node.style.transform = '';
        const clear = (): void => {
          node.style.transition = '';
          node.style.transformOrigin = '';
          node.removeEventListener('transitionend', clear);
        };
        node.addEventListener('transitionend', clear);
      });
    }
  }, [shownSignature]);

  return (
    <div
      className={styles.grid}
      style={{ aspectRatio: `${layout.ratio}`, ['--grid-ratio' as string]: layout.ratio }}
    >
      {layout.rows.map((row) => {
        const rowRatio = row.indexes.reduce((sum, index) => sum + normalizeRatio(shown[index]?.ratio), 0);

        return (
          <div key={row.indexes.join('-')} className={styles.row} style={{ flexGrow: row.weight }}>
            {row.indexes.map((index) => {
              const tile = shown[index];
              if (!tile) return null;
              const isLeaving = leaving.has(tile.key);
              const messageId = isLeaving ? null : tile.messageId;
              const selected = messageId !== null && selectedIds.has(messageId);
              const style: CSSProperties = { flexGrow: normalizeRatio(tile.ratio) / rowRatio };
              const overlay = !isLeaving && extra > 0 && index === shown.length - 1 ? `+${extra}` : undefined;

              return (
                <div
                  key={tile.key}
                  ref={(node) => {
                    if (node) nodesRef.current.set(tile.key, node);
                    else nodesRef.current.delete(tile.key);
                  }}
                  className={`${styles.cell} ${isLeaving ? styles.cellLeaving : ''}`}
                  style={style}
                >
                  {tile.attachment ? (
                    <MediaTile
                      attachment={tile.attachment}
                      chatId={chatId}
                      overlay={overlay}
                      selected={selected}
                      selectionMode={!isLeaving && selectionMode}
                      onLongPressTile={messageId !== null ? () => enterSelection(messageId) : undefined}
                      onTapSelect={messageId !== null ? () => toggleSelected(messageId) : undefined}
                      checkboxSlot={
                        selectionMode &&
                        messageId !== null && (
                          <span className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ''}`} aria-hidden="true">
                            {selected && <Icon name="check" size={14} />}
                          </span>
                        )
                      }
                    />
                  ) : (
                    <UploadingTile
                      local={tile.local}
                      onCancel={() => tile.clientId && onCancel(tile.clientId)}
                      onRetry={() => tile.clientId && onRetry(tile.clientId)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function UploadingTile({
  local,
  onCancel,
  onRetry,
}: {
  local: LocalAttachmentState | null;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const failed = !!local?.error;

  return (
    <div className={tileStyles.tile}>
      {local?.previewUrl &&
        (local.kind === 'video' ? (
          <video className={tileStyles.cover} src={local.previewUrl} muted playsInline />
        ) : (
          <img className={tileStyles.cover} src={local.previewUrl} alt="" draggable={false} />
        ))}
      <span className={styles.uploading}>
        {failed ? (
          <button
            type="button"
            className={styles.tileButton}
            onClick={onRetry}
            aria-label="Повторить отправку"
            title={local?.error}
          >
            <Icon name="retry" size={20} />
          </button>
        ) : (
          <>
            <ProgressRing progress={local?.progress ?? 0} />
            <button type="button" className={styles.tileButton} onClick={onCancel} aria-label="Отменить отправку">
              <Icon name="close" size={18} />
            </button>
          </>
        )}
      </span>
    </div>
  );
}
