import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuthStore } from '../stores/authStore';
import { ConsentGate } from './ConsentGate';
import { rememberPendingInvite } from './pendingInvite';
import styles from './ProtectedRoute.module.css';
import { useLayoutMode } from './useLayoutMode';

/** Пускает дальше только authenticated; остальные статусы обрабатываются выше, в App (секция 4). */
export function ProtectedRoute() {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const pendingConsent = useAuthStore((state) => state.user?.pendingConsent ?? null);
  const layout = useLayoutMode();

  if (status !== 'authenticated') {
    if (location.pathname.startsWith('/u/')) rememberPendingInvite(location.pathname);
    return <Navigate to="/login" replace />;
  }

  if (pendingConsent) {
    return (
      <>
        {layout === 'desktop' && (
          <div className={styles.backdrop} inert>
            <Outlet />
          </div>
        )}
        <ConsentGate pendingConsent={pendingConsent} />
      </>
    );
  }

  return <Outlet />;
}
