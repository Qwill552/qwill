import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../stores/authStore';

/** Пускает дальше только authenticated; остальные статусы обрабатываются выше, в App (секция 4). */
export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status);

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
