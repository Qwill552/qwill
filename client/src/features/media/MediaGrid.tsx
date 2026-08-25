import type { AttachmentDto } from '@messenger/shared';

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

export function MediaGrid({ tiles, chatId, onCancel, onRetry }: MediaGridProps) {
  const selectionMode = useChatStore((s) => s.selectionMode);
  const selectedIds = useChatStore((s) => s.selectedIds);
  const enterSelection = useChatStore((s) => s.enterSelection);
  const toggleSelected = useChatStore((s) => s.toggleSelected);

  const shown = tiles.slice(0, MOSAIC_MAX_ITEMS);
  const extra = tiles.length - shown.length;
  const layout = mosaicLayout(shown.map((tile) => tile.ratio));

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
              const style = { flexGrow: normalizeRatio(tile.ratio) / rowRatio };
              const overlay = extra > 0 && index === shown.length - 1 ? `+${extra}` : undefined;

              if (tile.attachment) {
                const messageId = tile.messageId;
                const selected = messageId !== null && selectedIds.has(messageId);

                return (
                  <MediaTile
                    key={tile.key}
                    attachment={tile.attachment}
                    chatId={chatId}
                    className={styles.cell}
                    style={style}
                    overlay={overlay}
                    selected={selected}
                    selectionMode={selectionMode}
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
                );
              }

              return (
                <UploadingTile
                  key={tile.key}
                  local={tile.local}
                  style={style}
                  onCancel={() => tile.clientId && onCancel(tile.clientId)}
                  onRetry={() => tile.clientId && onRetry(tile.clientId)}
                />
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
  style,
  onCancel,
  onRetry,
}: {
  local: LocalAttachmentState | null;
  style: React.CSSProperties;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const failed = !!local?.error;

  return (
    <div className={`${tileStyles.tile} ${styles.cell}`} style={style}>
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
