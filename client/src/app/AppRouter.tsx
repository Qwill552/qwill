import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthPage } from '../pages/AuthPage';
import { DownloadScreen } from '../pages/DownloadScreen';
import { StubScreen } from '../pages/StubScreen';
import { AppShell } from './AppShell';
import { ErrorBoundary } from './ErrorBoundary';
import { ProtectedRoute } from './ProtectedRoute';

export function AppRouter() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <ErrorBoundary>
            <AuthPage />
          </ErrorBoundary>
        }
      />
      <Route
        path="/download"
        element={
          <ErrorBoundary>
            <DownloadScreen />
          </ErrorBoundary>
        }
      />
      <Route
        path="/onboarding/appearance"
        element={
          <ErrorBoundary>
            <StubScreen title="Оформление" backTo="/chats" />
          </ErrorBoundary>
        }
      />
      <Route element={<ProtectedRoute />}>
        {/* AppShell владеет всей авторизованной частью — вложенные экраны матчатся
            внутри ScreenStack, а не отдельными <Route> здесь (иначе анимированный
            переход между ними невозможен, см. ux-ui/02-shell.md). */}
        <Route
          path="/*"
          element={
            <ErrorBoundary>
              <AppShell />
            </ErrorBoundary>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/chats" replace />} />
    </Routes>
  );
}
