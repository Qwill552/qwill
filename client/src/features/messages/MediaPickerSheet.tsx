import { isPlayableVideoMimeType } from '@messenger/shared';
import { useEffect, useState } from 'react';

import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { formatBytes } from './Attachment';
import styles from './MediaPickerSheet.module.css';

interface MediaPickerSheetProps {
  files: File[];
  onRemove: (index: number) => void;
  onClose: () => void;
  onSend: (caption: string) => void;
}

function useObjectUrls(files: File[]): (string | null)[] {
  const [urls, setUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    const next = files.map((file) =>
      file.type.startsWith('image/') || isPlayableVideoMimeType(file.type) ? URL.createObjectURL(file) : null,
    );
    setUrls(next);
    return () => {
      for (const url of next) if (url) URL.revokeObjectURL(url);
    };
  }, [files]);

  return urls;
}

export function MediaPickerSheet({ files, onRemove, onClose, onSend }: MediaPickerSheetProps) {
  const [caption, setCaption] = useState('');
  const urls = useObjectUrls(files);

  function handleSend(): void {
    onSend(caption.trim());
  }

  return (
    <Sheet title={`Отправить · ${files.length}`} onClose={onClose}>
      <div className={styles.grid}>
        {files.map((file, index) => {
          const url = urls[index];
          return (
            <div key={`${file.name}-${index}`} className={styles.item}>
              {url && file.type.startsWith('image/') ? (
                <img className={styles.thumb} src={url} alt={file.name} />
              ) : url && isPlayableVideoMimeType(file.type) ? (
                <video className={styles.thumb} src={url} muted />
              ) : (
                <div className={styles.fileTile}>
                  <Icon name="file" size={22} />
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                </div>
              )}
              <button
                type="button"
                className={styles.remove}
                onClick={() => onRemove(index)}
                aria-label={`Убрать ${file.name}`}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className={styles.captionRow}>
        <input
          className={styles.captionInput}
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Подпись"
        />
        <button type="button" className={styles.send} onClick={handleSend} disabled={files.length === 0} aria-label="Отправить">
          <Icon name="send" size={20} />
        </button>
      </div>
    </Sheet>
  );
}
