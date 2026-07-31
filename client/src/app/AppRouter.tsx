import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthPage } from '../pages/AuthPage';
import { MessengerPage } from '../pages/MessengerPage';
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
      <Route element={<ProtectedRoute />}>
        <Route
          path="/chats"
          element={
            <ErrorBoundary>
              <MessengerPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="/chats/:chatId"
          element={
            <ErrorBoundary>
              <MessengerPage />
            </ErrorBoundary>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/chats" replace />} />
    </Routes>
  );
}
