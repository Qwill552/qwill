import { ADMIN_PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH } from '@messenger/shared';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { changePasswordRequest } from '../api/auth';
import { ApiError } from '../api/client';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { Modal } from '../features/groups/Modal';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { IconButton } from '../ui/IconButton';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import styles from './PasswordScreen.module.css';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}

function PasswordField({ id, label, value, onChange, autoComplete }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.inputRow}>
        <input
          id={id}
          className={styles.input}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
        />
        <IconButton
          icon={visible ? 'eye-off' : 'eye'}
          label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          variant="plain"
          size={20}
          className={styles.toggle}
          onClick={() => setVisible((prev) => !prev)}
        />
      </div>
    </>
  );
}

function successText(terminatedSessions: number): string {
  if (terminatedSessions === 0) return 'Пароль изменён. Других активных сеансов не было.';
  if (terminatedSessions === 1) return 'Пароль изменён. Завершён 1 сеанс на другом устройстве.';
  return `Пароль изменён. Завершено сеансов на других устройствах: ${terminatedSessions}.`;
}

export function PasswordScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const role = useAuthStore((s) => s.user?.role);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const minLength = role === 'admin' ? ADMIN_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH;
  const mismatch = repeat.length > 0 && next !== repeat;
  const sameAsOld = next.length > 0 && current.length > 0 && next === current;
  const canSubmit =
    !pending && current.length > 0 && next.length >= minLength && next === repeat && !sameAsOld;

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setConfirming(true);
  }

  async function handleConfirm(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const { terminatedSessions } = await changePasswordRequest(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      setDone(successText(terminatedSessions));
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сменить пароль');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />

        <Card caption="Смена пароля">
          <form className={styles.form} onSubmit={handleSubmit}>
            <PasswordField
              id="password-current"
              label="Текущий пароль"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
            <PasswordField
              id="password-next"
              label="Новый пароль"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
            />
            <PasswordField
              id="password-repeat"
              label="Повторите новый пароль"
              value={repeat}
              onChange={setRepeat}
              autoComplete="new-password"
            />

            <p className={styles.hint}>
              {role === 'admin'
                ? `Пароль администратора — не короче ${minLength} символов.`
                : `Не короче ${minLength} символов.`}
            </p>

            {mismatch && <p className={styles.error}>Пароли не совпадают</p>}
            {sameAsOld && <p className={styles.error}>Новый пароль совпадает со старым</p>}
            {!confirming && error && <p className={styles.error}>{error}</p>}
            {done && <p className={styles.success}>{done}</p>}

            <button type="submit" className={styles.button} disabled={!canSubmit}>
              Сменить пароль
            </button>
          </form>
        </Card>
      </div>

      {confirming && (
        <Modal title="Сменить пароль?" onClose={() => setConfirming(false)}>
          <p className={styles.confirmText}>
            Смена пароля завершит сеансы на всех остальных устройствах — войти там придётся заново.
          </p>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button
              className={styles.cancelButton}
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Отмена
            </button>
            <button
              className={styles.confirmButton}
              type="button"
              onClick={() => void handleConfirm()}
              disabled={pending}
            >
              Сменить
            </button>
          </div>
        </Modal>
      )}

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в настройки" onClick={() => navigate('/settings')} />
          <GlassPill title="Пароль" />
        </ChromeBar>
      )}
    </div>
  );
}
