import { forwardRef } from 'react';

import styles from './SearchField.module.css';

/** Буквально из референса (строка 97): лупа 16×16, штрих 1.6 — не общая иконка
 *  приложения (24-сетка, штрих 2). */
function SearchIcon() {
  return (
    <svg className={styles.icon} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Показать кнопку «Отмена» справа от поля. */
  onCancel?: () => void;
  onFocus?: () => void;
  /** Поле-кнопка: тап ведёт на экран поиска, ввод здесь не идёт. */
  readOnly?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, placeholder = 'Поиск', onCancel, onFocus, readOnly, autoFocus, className },
  ref,
) {
  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      <div className={styles.field}>
        <SearchIcon />
        <input
          ref={ref}
          className={styles.input}
          type="search"
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          autoFocus={autoFocus}
          aria-label={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
        />
      </div>
      {onCancel && (
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Отмена
        </button>
      )}
    </div>
  );
});
