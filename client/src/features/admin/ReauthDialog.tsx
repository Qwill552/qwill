import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { adminReauthRequest, setAdminReauthHandler, setAdminTicket } from '../../api/admin';
import { ApiError } from '../../api/client';
import { Modal } from '../groups/Modal';
import styles from './ReauthDialog.module.css';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ReauthDialogProps {
  onDone: (confirmed: boolean) => void;
}

export function ReauthDialog({ onDone }: ReauthDialogProps) {
  const trapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    trapRef.current?.querySelector<HTMLElement>('input')?.focus();
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

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!password || pending) return;

    setPending(true);
    setError(null);
    try {
      const ticket = await adminReauthRequest(password);
      setAdminTicket(ticket.ticket);
      onDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось подтвердить пароль');
      setPassword('');
      setPending(false);
    }
  }

  return (
    <div ref={trapRef} onKeyDown={handleKeyDown}>
      <Modal title="Подтвердите пароль" onClose={() => onDone(false)} className={styles.overlay} opaque>
        <p className={styles.text}>
          Это действие открывает личные данные или меняет доступ. Введите пароль администратора — он
          не потребуется следующие 15 минут.
        </p>
        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            aria-label="Пароль администратора"
            disabled={pending}
          />

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => onDone(false)}
              disabled={pending}
            >
              Отмена
            </button>
            <button type="submit" className={styles.submitButton} disabled={pending || !password}>
              Подтвердить
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function AdminReauthGate() {
  const pendingRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setAdminReauthHandler(
      () =>
        new Promise<boolean>((resolve) => {
          pendingRef.current?.(false);
          pendingRef.current = resolve;
          setOpen(true);
        }),
    );
    return () => {
      setAdminReauthHandler(null);
      pendingRef.current?.(false);
      pendingRef.current = null;
    };
  }, []);

  function handleDone(confirmed: boolean): void {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    resolve?.(confirmed);
  }

  if (!open) return null;
  return <ReauthDialog onDone={handleDone} />;
}
