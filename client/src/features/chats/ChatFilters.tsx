import { Chip } from '../../ui/Chip';
import styles from './ChatFilters.module.css';

export type ChatFilter = 'all' | 'unread' | 'private' | 'groups';

const FILTERS: { id: ChatFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'unread', label: 'Непрочитанные' },
  { id: 'private', label: 'Личные' },
  { id: 'groups', label: 'Группы' },
];

interface ChatFiltersProps {
  value: ChatFilter;
  onChange: (value: ChatFilter) => void;
  /** Счётчики по фильтрам; показываются только там, где отличны от нуля. */
  counts: Record<ChatFilter, number>;
}

/** Встроенные фильтры списка чатов. Пользовательских папок в объёме нет, но ряд их примет. */
export function ChatFilters({ value, onChange, counts }: ChatFiltersProps) {
  return (
    <div className={styles.row} role="tablist" aria-label="Фильтр чатов">
      {FILTERS.map((filter) => (
        <Chip
          key={filter.id}
          label={filter.label}
          active={value === filter.id}
          count={filter.id === 'all' ? undefined : counts[filter.id]}
          onClick={() => onChange(filter.id)}
        />
      ))}
    </div>
  );
}
