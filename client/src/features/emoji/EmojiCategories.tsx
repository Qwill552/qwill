import { Icon, type IconName } from '../../ui/Icon';
import styles from './EmojiCategories.module.css';

const CATEGORY_ICONS: Record<string, IconName> = {
  Недавние: 'history',
  'Смайлы и люди': 'emoji',
  Животные: 'paw',
  Еда: 'apple',
  Активность: 'star',
  Путешествия: 'car',
  Объекты: 'lightbulb',
  Символы: 'heart',
  Флаги: 'flag',
};

interface EmojiCategoriesProps {
  labels: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function EmojiCategories({ labels, activeIndex, onSelect }: EmojiCategoriesProps) {
  return (
    <div className={`${styles.row} hide-native-scrollbar`}>
      {labels.map((label, index) => (
        <button
          key={label}
          type="button"
          className={`${styles.button} ${index === activeIndex ? styles.active : ''}`}
          aria-label={label}
          aria-pressed={index === activeIndex}
          title={label}
          onClick={() => onSelect(index)}
        >
          <Icon name={CATEGORY_ICONS[label] ?? 'more'} size={20} />
        </button>
      ))}
    </div>
  );
}
