import type { AttachmentDto } from '@messenger/shared';

import { MediaTile } from './MediaTile';
import { mosaicLayout, MOSAIC_MAX_ITEMS } from './mosaicLayout';
import { mediaRatio } from './useMediaSrc';
import styles from './MediaGrid.module.css';

export function MediaGrid({ attachments, chatId }: { attachments: AttachmentDto[]; chatId: string }) {
  const shown = attachments.slice(0, MOSAIC_MAX_ITEMS);
  const extra = attachments.length - shown.length;
  const layout = mosaicLayout(shown.map(mediaRatio));

  return (
    <div className={styles.grid} style={{ aspectRatio: `${layout.ratio}` }}>
      {layout.rows.map((row) => (
        <div key={row.indexes.join('-')} className={styles.row} style={{ flexGrow: row.weight }}>
          {row.indexes.map((index) => {
            const attachment = shown[index];
            if (!attachment) return null;
            return (
              <MediaTile
                key={attachment.id}
                attachment={attachment}
                chatId={chatId}
                className={styles.cell}
                style={{ flexGrow: mediaRatio(attachment) ?? 1 }}
                overlay={extra > 0 && index === shown.length - 1 ? `+${extra}` : undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
