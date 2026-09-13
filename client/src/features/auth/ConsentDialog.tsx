import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';

import { useEscapeKey } from '../../app/hotkeys';
import { useBackHandler } from '../../app/useBackHandler';
import styles from './ConsentDialog.module.css';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ConsentDialogProps {
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConsentDialog({ pending, error, onConfirm, onCancel }: ConsentDialogProps) {
  const trapRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useBackHandler(true, onCancel);
  useEscapeKey(true, onCancel);

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();
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

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) onCancel();
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={trapRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="Внимание"
        onKeyDown={handleKeyDown}
      >
        <h2 ref={titleRef} className={styles.title} tabIndex={-1}>
          Внимание
        </h2>

        <p className={styles.warning}>
          Администрация сайта предоставляет только техническую площадку и не несет
          ответственности за действия, сообщения или возможный обман со стороны других
          пользователей. Регистрируясь, вы берете эти риски на себя.
        </p>
        <p className={styles.fine}>
          Нажимая «Зарегистрироваться», вы подтверждаете, что вам исполнилось 18 лет, а также
          что вы ознакомились и согласны с{' '}
          <a href="/legal/terms" target="_blank" rel="noopener noreferrer">
            Пользовательским соглашением
          </a>{' '}
          и{' '}
          <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">
            Политикой обработки персональных данных
          </a>
          .
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={pending}
          >
            Отмена
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={onConfirm}
            disabled={pending}
          >
            Зарегистрироваться
          </button>
        </div>
      </div>
    </div>
  );
}
