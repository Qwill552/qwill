import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthPage } from '../pages/AuthPage';
import { MessengerPage } from '../pages/MessengerPage';
import { ProtectedRoute } from './ProtectedRoute';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/chats" element={<MessengerPage />} />
        <Route path="/chats/:chatId" element={<MessengerPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chats" replace />} />
    </Routes>
  );
}
