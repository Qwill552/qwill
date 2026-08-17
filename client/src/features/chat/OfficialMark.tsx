import { Icon } from '../../ui/Icon';
import styles from './OfficialMark.module.css';

/** Пометка «официальный» рядом с названием сервисного чата: галочка в акцентном кружке.
 *  Отдельным элементом, а не частью названия, — она нужна и в списке чатов, и в шапке. */
export function OfficialMark({ size = 15 }: { size?: number }) {
  return (
    <span className={styles.mark} style={{ width: size, height: size }} title="Официальный чат Qwill">
      <Icon name="check" size={Math.round(size * 0.66)} />
    </span>
  );
}
