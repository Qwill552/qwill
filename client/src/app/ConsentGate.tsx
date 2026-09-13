import type { PublicUser } from '@messenger/shared';
import { useEffect, useState } from 'react';

import { ApiError } from '../api/client';
import { acceptLegalRequest, getCurrentLegalVersionsRequest } from '../api/legal';
import { PolicyUpdatePoster } from '../features/auth/PolicyUpdatePoster';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

const ERROR_VISIBLE_MS = 3500;

interface ConsentGateProps {
  pendingConsent: { terms: boolean; privacy: boolean };
}

export function ConsentGate({ pendingConsent }: ConsentGateProps) {
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<PublicUser | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), ERROR_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  async function handleAccept(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const currentVersions = await getCurrentLegalVersionsRequest();
      setAccepted(await acceptLegalRequest(currentVersions));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить согласие. Проверьте соединение.');
    } finally {
      setPending(false);
    }
  }

  return (
    <PolicyUpdatePoster
      changedDocs={pendingConsent}
      pending={pending}
      error={error}
      dark={theme === 'dark'}
      accepted={accepted}
      onAccept={() => void handleAccept()}
      onDecline={() => void logout()}
      onEnter={() => accepted && updateUser(accepted)}
      onToggleTheme={toggleTheme}
    />
  );
}
