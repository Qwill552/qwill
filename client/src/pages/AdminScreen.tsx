import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { findAdminUserByUsernameRequest } from '../api/admin';
import { ApiError } from '../api/client';
import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../ui/Card';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import styles from './AdminScreen.module.css';

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return 'Пользователь не найден';
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

/** Вкладка «Админ-панель»: поиск пользователя по username и переход в его карточку
 *  (R-32B). Ряд чипсов под поиском намеренно пуст — «Предложка» и «Жалобы» приходят
 *  в 32C и 32D. */
export function AdminScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const role = useAuthStore((s) => s.user?.role);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleSearch(event: FormEvent): void {
    event.preventDefault();
    const username = query.trim();
    if (!username || busy) return;

    setBusy(true);
    setMessage(null);
    findAdminUserByUsernameRequest(username)
      .then((user) => navigate(`/admin/users/${user.id}`))
      .catch((error: unknown) => setMessage(errorText(error)))
      .finally(() => setBusy(false));
  }

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />

        {!isDesktop && (
          <div className={styles.top}>
            <h1 className={styles.title}>Админ-панель</h1>
          </div>
        )}

        {role !== 'admin' ? (
          <Card caption="Администрирование">
            <Card.Row title="Нет доступа" subtitle="Этот экран только для администраторов" />
          </Card>
        ) : (
          <>
            <Card caption="Пользователь">
              <form className={styles.search} onSubmit={handleSearch}>
                <input
                  className={styles.input}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Имя пользователя"
                />
                <button type="submit" className={styles.button} disabled={busy}>
                  Найти
                </button>
              </form>
              {message && <Card.Row title="Не найдено" subtitle={message} danger />}
            </Card>

            <Card caption="Управление">
              <Card.Row
                title="Журнал действий"
                subtitle="Кто, что и когда сделал"
                onClick={() => navigate('/admin/log')}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
