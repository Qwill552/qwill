import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { requestSupportChat } from '../../api/support';
import { Modal } from '../groups/Modal';
import styles from './BugReportDialog.module.css';

interface BugReportDialogProps {
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BugReportDialog({ onClose }: BugReportDialogProps) {
  const navigate = useNavigate();
  const trapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    trapRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => triggerRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab') return;
    const focusable = trapRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const { chatId } = await requestSupportChat();
      onClose();
      navigate(`/chats/${chatId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось открыть чат с админом');
      setPending(false);
    }
  }

  return (
    <div ref={trapRef} onKeyDown={handleKeyDown}>
      <Modal title="Нашли баг? Есть предложение?" onClose={onClose}>
        <p className={styles.text}>Qwill делает один человек в свободное время.</p>
        <p className={styles.text}>
          Если что-то сломалось или ведёт себя странно — напишите. Опишите, что вы делали и что произошло; скриншот
          ускоряет дело в разы.
        </p>
        <p className={styles.text}>
          Если просто придумали, как сделать удобнее, — тоже пишите. Идеи приходят реже багов и ценятся не меньше.
        </p>
        <p className={styles.text}>Читают всё, отвечают не всегда и не сразу.</p>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={pending}>
            Отмена
          </button>
          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void handleSubmit()}
            disabled={pending}
          >
            Написать админу
          </button>
        </div>
      </Modal>
    </div>
  );
}
