import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initNativeCalls } from './calls/nativeCall';
import './styles/tokens.css';

void initNativeCalls();

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
