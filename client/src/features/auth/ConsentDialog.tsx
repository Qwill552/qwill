import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';

import { useEscapeKey } from '../../app/hotkeys';
import { useBackHandler } from '../../app/useBackHandler';
import styles from './ConsentDialog.module.css';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ConsentDialogBaseProps {
  pending: boolean;
  error: string | null;
}

interface SignupConsentDialogProps extends ConsentDialogBaseProps {
  variant: 'signup';
  onConfirm: () => void;
  onCancel: () => void;
}

interface UpdateConsentDialogProps extends ConsentDialogBaseProps {
  variant: 'update';
  changedDocs: { terms: boolean; privacy: boolean };
  onAccept: () => void;
  onDecline: () => void;
}

type ConsentDialogProps = SignupConsentDialogProps | UpdateConsentDialogProps;

export function ConsentDialog(props: ConsentDialogProps) {
  const trapRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dismissible = props.variant === 'signup';
  const onDismiss = props.variant === 'signup' ? props.onCancel : () => undefined;

  useBackHandler(dismissible, onDismiss);
  useEscapeKey(dismissible, onDismiss);

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
    if (dismissible && event.target === event.currentTarget) onDismiss();
  }

  const title = props.variant === 'signup' ? 'Внимание' : 'Соглашение обновилось';

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={trapRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKeyDown}
      >
        <h2 ref={titleRef} className={styles.title} tabIndex={-1}>
          {title}
        </h2>

        {props.variant === 'signup' ? (
          <>
            <p className={styles.warning}>
              Внимание: Администрация сайта предоставляет только техническую площадку и не несет
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
          </>
        ) : (
          <>
            <p className={styles.warning}>
              {[
                props.changedDocs.terms && 'Пользовательское соглашение',
                props.changedDocs.privacy && 'Политика обработки персональных данных',
              ]
                .filter(Boolean)
                .join(' и ')}{' '}
              обновились. Чтобы продолжить пользоваться Qwill, ознакомьтесь с новой версией
              и примите её заново.
            </p>
            <p className={styles.fine}>
              {props.changedDocs.terms && (
                <a href="/legal/terms" target="_blank" rel="noopener noreferrer">
                  Пользовательское соглашение
                </a>
              )}
              {props.changedDocs.terms && props.changedDocs.privacy && ' · '}
              {props.changedDocs.privacy && (
                <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">
                  Политика обработки персональных данных
                </a>
              )}
            </p>
          </>
        )}

        {props.error && <p className={styles.error}>{props.error}</p>}

        <div className={styles.actions}>
          {props.variant === 'signup' ? (
            <>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={props.onCancel}
                disabled={props.pending}
              >
                Отмена
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={props.onConfirm}
                disabled={props.pending}
              >
                Зарегистрироваться
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={props.onDecline}
                disabled={props.pending}
              >
                Не принимаю
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={props.onAccept}
                disabled={props.pending}
              >
                Принимаю
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
