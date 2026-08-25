import { GlassButton } from '../../ui/chrome/GlassButton';
import { GlassPill } from '../../ui/chrome/GlassPill';
import styles from './SelectionHeader.module.css';

interface SelectionHeaderProps {
  count: number;
  /** «Изменить» — только если выбрано ровно одно своё неудалённое сообщение (ux-ui/06). */
  canEdit: boolean;
  /** «Удалить» — только если удалить можно каждое выбранное: чужое в приватном чате не
   *  удаляется ни при каких условиях, и кнопка, которая всё равно откажет, только путает. */
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
}

/** Шапка мультивыбора — заменяет обычные back/pill/more той же капсульной хромы чата,
 *  не добавляя новый размывающий слой (ux-ui/06-message-interaction.md, секция 3). */
export function SelectionHeader({
  count,
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onCopy,
  onForward,
  onDelete,
}: SelectionHeaderProps) {
  return (
    <>
      <GlassButton icon="close" label="Выйти из выделения" onClick={onClose} />
      <GlassPill title={<span key={count} className={styles.count}>{`Выбрано ${count}`}</span>} />
      <div className={styles.actions}>
        {canEdit && <GlassButton icon="edit" label="Редактировать" onClick={onEdit} />}
        <GlassButton icon="copy" label="Копировать" onClick={onCopy} />
        <GlassButton icon="forward" label="Переслать" onClick={onForward} />
        {canDelete && <GlassButton icon="trash" label="Удалить" variant="danger" onClick={onDelete} />}
      </div>
    </>
  );
}
