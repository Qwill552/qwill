import type { AttachmentDto } from '@messenger/shared';

import { MediaTile } from './MediaTile';
import { mediaRatio } from './useMediaSrc';
import styles from './MediaBubble.module.css';

const FALLBACK_RATIO = 1;

export function MediaBubble({ attachment, chatId }: { attachment: AttachmentDto; chatId: string }) {
  const ratio = mediaRatio(attachment);

  if (ratio === null) {
    return (
      <div
        className={styles.single}
        style={{
          aspectRatio: `${FALLBACK_RATIO}`,
          ['--media-ratio' as string]: FALLBACK_RATIO,
          ['--media-natural-w' as string]: '100vw',
        }}
      >
        <MediaTile attachment={attachment} chatId={chatId} fit="contain" />
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
