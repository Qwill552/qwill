import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type Health = 'checking' | 'ok' | 'down';

/**
 * Заглушка этапа 0: проверяет, что цепочка клиент → API → БД собрана.
 * На этапе 1 заменяется роутером и экранами (секция 4).
 */
export function App() {
  const [health, setHealth] = useState<Health>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/health`, { signal: controller.signal })
      .then((res) => setHealth(res.ok ? 'ok' : 'down'))
      .catch(() => {
        if (!controller.signal.aborted) setHealth('down');
      });
    return () => controller.abort();
  }, []);

  const label = {
    checking: 'Проверяю связь с сервером…',
    ok: 'Сервер и база данных отвечают',
    down: `Сервер недоступен (${API_URL})`,
  }[health];

  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        height: '100%',
        padding: 'var(--space-5)',
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-md)',
          padding: 'var(--space-6)',
          textAlign: 'center',
          maxWidth: 420,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--primary)' }}>Messenger</h1>
        <p style={{ margin: 'var(--space-3) 0 0', color: 'var(--text-secondary)' }}>
          Этап 0: каркас собран
        </p>
        <p
          style={{
            margin: 'var(--space-4) 0 0',
            color: health === 'down' ? '#d14343' : 'var(--text-primary)',
          }}
        >
          {label}
        </p>
      </div>
    </main>
  );
}
