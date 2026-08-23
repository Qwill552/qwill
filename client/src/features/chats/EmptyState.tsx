import type { ReactNode } from 'react';

import styles from './EmptyState.module.css';

/** Иллюстрированная заглушка — переиспользуется для пустого списка чатов и пустой главной панели (секция 5). */
export function EmptyState({ title, subtitle, illustration }: { title: string; subtitle?: string; illustration?: ReactNode }) {
  return (
    <div className={styles.wrap}>
      {illustration ?? (
        <svg width="112" height="112" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <circle cx="60" cy="60" r="56" fill="var(--primary-soft)" />
          <path
            d="M34 46a10 10 0 0 1 10-10h32a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H52l-12 10v-10h-6a10 10 0 0 1-10-10V46Z"
            fill="var(--surface)"
            stroke="var(--primary)"
            strokeWidth="3"
          />
          <circle cx="52" cy="56" r="3.5" fill="var(--primary)" />
          <circle cx="64" cy="56" r="3.5" fill="var(--primary)" />
          <circle cx="76" cy="56" r="3.5" fill="var(--primary)" />
        </svg>
      )}
      <p className={styles.title}>{title}</p>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}
