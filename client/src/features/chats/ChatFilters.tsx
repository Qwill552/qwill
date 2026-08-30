import { Chip } from '../../ui/Chip';
import styles from './ChatFilters.module.css';

export type ChatFilter = 'all' | 'unread' | 'private' | 'groups' | 'support';

const FILTERS: { id: ChatFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'unread', label: 'Непрочитанные' },
  { id: 'private', label: 'Личные' },
  { id: 'groups', label: 'Группы' },
];

const ADMIN_FILTERS: { id: ChatFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'support', label: 'Предложка' },
];

interface ChatFiltersProps {
  value: ChatFilter;
  onChange: (value: ChatFilter) => void;
  counts: Partial<Record<ChatFilter, number>>;
  admin?: boolean;
}

export function ChatFilters({ value, onChange, counts, admin }: ChatFiltersProps) {
  const items = admin ? ADMIN_FILTERS : FILTERS;

  return (
    <div className={styles.row} role="tablist" aria-label="Фильтр чатов">
      {items.map((filter) => (
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
