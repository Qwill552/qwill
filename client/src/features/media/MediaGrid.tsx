import type { AttachmentDto } from '@messenger/shared';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { cssDurationMs } from '../../ui/motion';
import { type LocalAttachmentState, type LocalMessage, useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
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

interface MediaGridProps {
  tiles: AlbumTile[];
  chatId: string;
  onCancel: (clientId: string) => void;
  onRetry: (clientId: string) => void;
}

/** Мозаика альбома. Удаление снимка (R-15) не рвёт раскладку рывком: ушедшая плитка сама
 *  тает и уменьшается (--dur-close), пока ещё занимает своё место в сетке, а когда её и
 *  правда убирают из расчёта — соседи переезжают на новые места через FLIP: измеряется
 *  прямоугольник «до», после перерисовки — «после», разница гасится обратным `transform`
 *  без перехода и тут же снимается с переходом (--dur-menu). */
export function MediaGrid({ tiles, chatId, onCancel, onRetry }: MediaGridProps) {
  const selectionMode = useChatStore((s) => s.selectionMode);
  const selectedIds = useChatStore((s) => s.selectedIds);
  const enterSelection = useChatStore((s) => s.enterSelection);
  const toggleSelected = useChatStore((s) => s.toggleSelected);

  const [leaving, setLeaving] = useState<Map<string, AlbumTile>>(new Map());
  const prevTilesRef = useRef<AlbumTile[]>(tiles);
  const nodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const rectsRef = useRef<Map<string, DOMRect>>(new Map());

  // Тот же приём, что у «уходящей» строки ленты (MessageList.LeavingMessageRow): диффим
  // в useLayoutEffect, чтобы плитка не мигнула пропаданием на один кадр до того, как
  // попадёт в leaving.
  useLayoutEffect(() => {
    const nextKeys = new Set(tiles.map((t) => t.key));
    const goneNow = prevTilesRef.current.filter((t) => !nextKeys.has(t.key) && !leaving.has(t.key));
    prevTilesRef.current = tiles;
    if (goneNow.length === 0) return;

    setLeaving((prev) => {
      const next = new Map(prev);
      for (const tile of goneNow) next.set(tile.key, tile);
      return next;
    });

    const ms = cssDurationMs('--dur-close') + 80;
    for (const tile of goneNow) {
      setTimeout(() => {
        setLeaving((prev) => {
          if (!prev.has(tile.key)) return prev;
          const next = new Map(prev);
          next.delete(tile.key);
          return next;
        });
      }, ms);
    }
  }, [tiles, leaving]);

  const shown = [...tiles, ...leaving.values()]
    .sort((a, b) => (a.messageId ?? 0) - (b.messageId ?? 0))
    .slice(0, MOSAIC_MAX_ITEMS);
  const extra = tiles.length - tiles.slice(0, MOSAIC_MAX_ITEMS).length;
  const layout = mosaicLayout(shown.map((tile) => tile.ratio));

  useLayoutEffect(() => {
    const prevRects = rectsRef.current;
    const nextRects = new Map<string, DOMRect>();

    for (const [key, node] of nodesRef.current) {
      const rect = node.getBoundingClientRect();
      nextRects.set(key, rect);
      const prev = prevRects.get(key);
      if (!prev) continue;

      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      const sx = prev.width / rect.width;
      const sy = prev.height / rect.height;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;

      node.style.transition = 'none';
      node.style.transformOrigin = 'top left';
      node.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      // Форсируем reflow, чтобы браузер зафиксировал стартовое положение до снятия перехода.
      void node.getBoundingClientRect();

      requestAnimationFrame(() => {
        node.style.transition = `transform var(--dur-menu) var(--ease-screen)`;
        node.style.transform = '';
        const clear = (): void => {
          node.style.transition = '';
          node.removeEventListener('transitionend', clear);
        };
        node.addEventListener('transitionend', clear);
      });
    }

    rectsRef.current = nextRects;
  }, [layout, shown.length]);

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
