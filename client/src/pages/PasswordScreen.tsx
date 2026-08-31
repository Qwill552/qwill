import { ADMIN_PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH } from '@messenger/shared';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { changePasswordRequest } from '../api/auth';
import { ApiError } from '../api/client';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import styles from './PasswordScreen.module.css';

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
  const [done, setDone] = useState(false);

  const minLength = role === 'admin' ? ADMIN_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH;
  const mismatch = repeat.length > 0 && next !== repeat;
  const canSubmit = !pending && current.length > 0 && next.length >= minLength && next === repeat;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setError(null);
    try {
      await changePasswordRequest(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      setDone(true);
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
          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <label className={styles.label} htmlFor="password-current">
              Текущий пароль
            </label>
            <input
              id="password-current"
              className={styles.input}
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
            />

            <label className={styles.label} htmlFor="password-next">
              Новый пароль
            </label>
            <input
              id="password-next"
              className={styles.input}
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
            />

            <label className={styles.label} htmlFor="password-repeat">
              Повторите новый пароль
            </label>
            <input
              id="password-repeat"
              className={styles.input}
              type="password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
              autoComplete="new-password"
            />

            <p className={styles.hint}>
              {role === 'admin'
                ? `Пароль администратора — не короче ${minLength} символов.`
                : `Не короче ${minLength} символов.`}
            </p>

            {mismatch && <p className={styles.error}>Пароли не совпадают</p>}
            {error && <p className={styles.error}>{error}</p>}
            {done && <p className={styles.success}>Пароль изменён</p>}

            <button type="submit" className={styles.button} disabled={!canSubmit}>
              Сменить пароль
            </button>
          </form>
        </Card>
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в настройки" onClick={() => navigate('/settings')} />
          <GlassPill title="Пароль" />
        </ChromeBar>
      )}
    </div>
  );
}
