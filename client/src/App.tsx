import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppRouter } from './app/AppRouter';
import { DesktopTitleBar } from './app/DesktopTitleBar';
import { registerServiceWorker } from './app/serviceWorker';
import { startCacheMaintenance } from './cache/mediaCache';
import { warmEmojiAssets } from './features/emoji/emojiIndex';
import { isDesktopShell } from './native/desktop';
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
    void registerServiceWorker();
    startCacheMaintenance();
    warmEmojiAssets();
  }, [bootstrap]);

  if (status === 'idle' || status === 'loading') {
    return (
      <>
        {isDesktopShell() && <DesktopTitleBar />}
        <main style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Загрузка…</p>
        </main>
      </>
    );
  }

  return (
    <>
      {isDesktopShell() && <DesktopTitleBar />}
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </>
  );
}
