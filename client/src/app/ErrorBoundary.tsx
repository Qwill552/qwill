import { Component, type ErrorInfo, type ReactNode } from 'react';

import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Ловит краши рендера отдельно на каждой странице — сломанный экран не должен уносить с собой всё приложение (этап 10). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Необработанная ошибка на странице:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <main className={styles.wrap} role="alert">
          <p className={styles.title}>Что-то пошло не так</p>
          <p className={styles.subtitle}>Попробуйте обновить страницу.</p>
          <button type="button" className={styles.button} onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
