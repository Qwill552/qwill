import { loginSchema, registerSchema } from '@messenger/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { SkyScene } from '../features/auth/SkyScene';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import styles from './AuthPage.module.css';

type Mode = 'login' | 'register';

function issuesToFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.join('.');
    if (!(path in errors)) errors[path] = issue.message;
  }
  return errors;
}

export function AuthPage() {
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') navigate('/chats', { replace: true });
  }, [status, navigate]);

  function switchMode() {
    setMode((current) => (current === 'login' ? 'register' : 'login'));
    setFormError(null);
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setFormError(null);

    try {
      if (mode === 'login') {
        const result = loginSchema.safeParse({ username, password });
        if (!result.success) {
          setFieldErrors(issuesToFieldErrors(result.error.issues));
          return;
        }
        setFieldErrors({});
        setSubmitting(true);
        await login(result.data);
      } else {
        const result = registerSchema.safeParse({ username, password, displayName });
        if (!result.success) {
          setFieldErrors(issuesToFieldErrors(result.error.issues));
          return;
        }
        setFieldErrors({});
        setSubmitting(true);
        await register(result.data);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        if (error.fields) setFieldErrors(error.fields);
      } else {
        setFormError('Не удалось выполнить запрос. Проверьте соединение.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.screen}>
      <SkyScene />

      <div className={styles.card}>
        <div className={styles.logo}>M</div>
        <h1 className={styles.title}>{mode === 'login' ? 'С возвращением!' : 'Добро пожаловать!'}</h1>

        {formError && <p className={styles.formError}>{formError}</p>}

        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className={styles.fieldWrapper}>
            <input
              className={styles.input}
              type="text"
              placeholder="Имя пользователя (@username)"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            {mode === 'register' && (
              <div className={`${styles.tooltip} ${username ? styles.tooltipVisible : ''}`}>
                Выбирайте имя пользователя с умом! Его невозможно изменить после регистрации. По
                нему вас смогут найти другие люди.
              </div>
            )}
            {fieldErrors.username && <p className={styles.fieldError}>{fieldErrors.username}</p>}
          </div>

          {mode === 'register' && (
            <div className={styles.fieldWrapper}>
              <input
                className={styles.input}
                type="text"
                placeholder="Ваше имя"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              {fieldErrors.displayName && (
                <p className={styles.fieldError}>{fieldErrors.displayName}</p>
              )}
            </div>
          )}

          <div className={styles.fieldWrapper}>
            <input
              className={styles.input}
              type="password"
              placeholder="Пароль"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {fieldErrors.password && <p className={styles.fieldError}>{fieldErrors.password}</p>}
          </div>

          <div className={styles.buttons}>
            <button
              type="submit"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={submitting}
            >
              {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSecondary}`}
              disabled={submitting}
              onClick={switchMode}
            >
              {mode === 'login' ? 'Создать аккаунт' : 'У меня уже есть аккаунт'}
            </button>
          </div>
        </form>

        <button
          type="button"
          className={styles.themeToggle}
          onClick={toggleTheme}
          title="Сменить тему"
          aria-label="Сменить тему"
        >
          {theme === 'dark' ? '🌙' : '☀️'}
        </button>
      </div>
    </div>
  );
}
