import { useState } from 'react';

import { ApiError } from '../../api/client';
import { Sheet } from '../../ui/Sheet';
import styles from './ReportSheet.module.css';

interface ReportSheetProps {
  hint: string;
  onClose: () => void;
  onSend: (comment: string) => Promise<void>;
}

export function ReportSheet({ hint, onClose, onSend }: ReportSheetProps) {
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend(): Promise<void> {
    setSending(true);
    setError(null);
    try {
      await onSend(comment.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить жалобу');
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet title="Пожаловаться" onClose={onClose}>
      {sent ? (
        <p className={styles.done}>Жалоба отправлена. Её посмотрит человек.</p>
      ) : (
        <div className={styles.body}>
          <p className={styles.hint}>{hint}</p>
          <textarea
            className={styles.input}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={4}
            autoFocus
            aria-label="Что не так"
          />
          {error && <p className={styles.error}>{error}</p>}
          <button
            type="button"
            className={styles.send}
            onClick={() => void handleSend()}
            disabled={sending || comment.trim() === ''}
          >
            Отправить
          </button>
        </div>
      )}
    </Sheet>
  );
}
