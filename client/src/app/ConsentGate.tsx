import { useState } from 'react';

import { ApiError } from '../api/client';
import { acceptLegalRequest, getCurrentLegalVersionsRequest } from '../api/legal';
import { ConsentDialog } from '../features/auth/ConsentDialog';
import { useAuthStore } from '../stores/authStore';

interface ConsentGateProps {
  pendingConsent: { terms: boolean; privacy: boolean };
}

export function ConsentGate({ pendingConsent }: ConsentGateProps) {
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const currentVersions = await getCurrentLegalVersionsRequest();
      updateUser(await acceptLegalRequest(currentVersions));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить согласие. Проверьте соединение.');
    } finally {
      setPending(false);
    }
  }

  return (
    <ConsentDialog
      variant="update"
      changedDocs={pendingConsent}
      pending={pending}
      error={error}
      onAccept={() => void handleAccept()}
      onDecline={() => void logout()}
    />
  );
}
