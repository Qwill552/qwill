import type { KeyboardEvent } from 'react';

import { GlassButton } from '../../ui/chrome/GlassButton';
import { Icon } from '../../ui/Icon';
import styles from './ChatSearchBar.module.css';

interface ChatSearchBarProps {
  isDesktop: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  total: number;
  activeIndex: number;
  loading: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/** Поле поиска внутри чата — заменяет содержимое шапки целиком (R-33). На десктопе
 *  добавляет счётчик и стрелки, на телефоне остаётся только полем: список найденного
 *  рисует `ChatSearchList` отдельно, поверх ленты. */
export function ChatSearchBar({
  isDesktop,
  query,
  onQueryChange,
  total,
  activeIndex,
  loading,
  onNext,
  onPrev,
  onClose,
}: ChatSearchBarProps) {
  const hasQuery = query.trim().length > 0;
  const counter = !hasQuery || loading ? null : total > 0 ? `${activeIndex + 1} из ${total}` : 'Ничего не найдено';

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.shiftKey) onPrev();
    else onNext();
  }

  return (
    <div className={styles.bar} role="search">
      <Icon name="search" size={18} className={styles.icon} />
      <input
        className={styles.input}
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={isDesktop ? handleKeyDown : undefined}
        placeholder="Поиск в чате"
        aria-label="Поиск в чате"
        autoComplete="off"
        enterKeyHint="search"
        autoFocus
      />
      {isDesktop && counter && (
        <span className={styles.counter} aria-live="polite">
          {counter}
        </span>
      )}
      {isDesktop && (
        <>
          <GlassButton
            variant="plain"
            icon="chevron-up"
            label="Предыдущее совпадение"
            disabled={total === 0}
            onClick={onPrev}
          />
          <GlassButton
            variant="plain"
            icon="chevron-down"
            label="Следующее совпадение"
            disabled={total === 0}
            onClick={onNext}
          />
        </>
      )}
      <GlassButton variant={isDesktop ? 'plain' : 'default'} icon="close" label="Закрыть поиск" onClick={onClose} />
    </div>
  );
}
