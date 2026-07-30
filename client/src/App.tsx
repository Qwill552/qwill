import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppRouter } from './app/AppRouter';
import { useAuthStore } from './stores/authStore';

/**
 * Восстанавливает сессию по refresh-куке до первого рендера роутов —
 * без этого перезагрузка страницы всегда выкидывала бы на /login (секция 4, этап 1).
 */
export function App() {
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'idle' || status === 'loading') {
    return (
      <main style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Загрузка…</p>
      </main>
    );
  }

  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}
