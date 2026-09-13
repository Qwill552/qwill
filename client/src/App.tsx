import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ApiError } from './api/client';
import { acceptLegalRequest, getCurrentLegalVersionsRequest } from './api/legal';
import { AppRouter } from './app/AppRouter';
import { DesktopTitleBar } from './app/DesktopTitleBar';
import { registerServiceWorker } from './app/serviceWorker';
import { startCacheMaintenance } from './cache/mediaCache';
import { pruneCachedHistory } from './cache/messageCache';
import { ConsentDialog } from './features/auth/ConsentDialog';
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
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [consentPending, setConsentPending] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
    void registerServiceWorker();
    startCacheMaintenance();
    void pruneCachedHistory(null);
    warmEmojiAssets();
  }, [bootstrap]);

  async function handleConsentAccept(): Promise<void> {
    setConsentPending(true);
    setConsentError(null);
    try {
      const currentVersions = await getCurrentLegalVersionsRequest();
      updateUser(await acceptLegalRequest(currentVersions));
    } catch (error) {
      setConsentError(
        error instanceof ApiError ? error.message : 'Не удалось сохранить согласие. Проверьте соединение.',
      );
    } finally {
      setConsentPending(false);
    }
  }

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

  if (status === 'authenticated' && user?.pendingConsent) {
    return (
      <>
        {isDesktopShell() && <DesktopTitleBar />}
        <ConsentDialog
          variant="update"
          changedDocs={user.pendingConsent}
          pending={consentPending}
          error={consentError}
          onAccept={() => void handleConsentAccept()}
          onDecline={() => void logout()}
        />
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
