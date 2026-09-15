import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { NotificationStack } from './NotificationStack';
import '../styles/tokens.css';
import './popup.css';

const container = document.getElementById('notifications');
if (!container) throw new Error('Не найден #notifications');

createRoot(container).render(
  <StrictMode>
    <NotificationStack />
  </StrictMode>,
);
