import type { AttachmentDto } from '@messenger/shared';

import type { LocalAttachmentState, LocalMessage } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { ProgressRing } from '../messages/ProgressRing';
import { MediaTile } from './MediaTile';
import { mosaicLayout, MOSAIC_MAX_ITEMS } from './mosaicLayout';
import { mediaRatio } from './useMediaSrc';
import styles from './MediaGrid.module.css';
import tileStyles from './MediaTile.module.css';

export interface AlbumTile {
  key: string;
  ratio: number | null;
  attachment: AttachmentDto | null;
  local: LocalAttachmentState | null;
  clientId: string | null;
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
  }));
}

interface MediaGridProps {
  tiles: AlbumTile[];
  chatId: string;
  onCancel: (clientId: string) => void;
  onRetry: (clientId: string) => void;
}

export function MediaGrid({ tiles, chatId, onCancel, onRetry }: MediaGridProps) {
  const shown = tiles.slice(0, MOSAIC_MAX_ITEMS);
  const extra = tiles.length - shown.length;
  const layout = mosaicLayout(shown.map((tile) => tile.ratio));

  return (
    <div
      className={styles.grid}
      style={{ aspectRatio: `${layout.ratio}`, ['--grid-ratio' as string]: layout.ratio }}
    >
      {layout.rows.map((row) => (
        <div key={row.indexes.join('-')} className={styles.row} style={{ flexGrow: row.weight }}>
          {row.indexes.map((index) => {
            const tile = shown[index];
            if (!tile) return null;
            const style = { flexGrow: tile.ratio ?? 1 };
            const overlay = extra > 0 && index === shown.length - 1 ? `+${extra}` : undefined;

            if (tile.attachment) {
              return (
                <MediaTile
                  key={tile.key}
                  attachment={tile.attachment}
                  chatId={chatId}
                  className={styles.cell}
                  style={style}
                  overlay={overlay}
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
      ))}
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
