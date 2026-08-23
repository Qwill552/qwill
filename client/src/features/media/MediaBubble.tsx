import type { AttachmentDto } from '@messenger/shared';

import { MediaTile } from './MediaTile';
import { mediaRatio } from './useMediaSrc';
import styles from './MediaBubble.module.css';

export function MediaBubble({ attachment, chatId }: { attachment: AttachmentDto; chatId: string }) {
  const ratio = mediaRatio(attachment);

  if (ratio === null) {
    return (
      <div className={styles.auto}>
        <MediaTile attachment={attachment} chatId={chatId} fit="natural" />
      </div>
    );
  }

  return (
    <div
      className={styles.single}
      style={{
        aspectRatio: `${attachment.width} / ${attachment.height}`,
        ['--media-ratio' as string]: ratio,
        ['--media-natural-w' as string]: `${attachment.width}px`,
      }}
    >
      <MediaTile attachment={attachment} chatId={chatId} />
    </div>
  );
}
