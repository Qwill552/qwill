import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initNativeCalls, setCallBackgroundStyle } from './calls/nativeCall';
import { useUiStore } from './stores/uiStore';
import './styles/tokens.css';

void initNativeCalls();
void setCallBackgroundStyle(useUiStore.getState().callBackground);

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
