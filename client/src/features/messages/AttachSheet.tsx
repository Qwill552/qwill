import { ALLOWED_MIME_TYPES } from '@messenger/shared';
import { useEffect, useRef } from 'react';

import { useLayoutMode } from '../../app/useLayoutMode';
import { Icon, type IconName } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import styles from './AttachSheet.module.css';

interface AttachSheetProps {
  onClose: () => void;
  onFilesSelected: (files: File[]) => void;
}

interface Tile {
  id: string;
  icon: IconName;
  label: string;
  accept: string;
}

const ALL_FILES_ACCEPT = ALLOWED_MIME_TYPES.join(',');

const TILES: Tile[] = [
  { id: 'gallery', icon: 'image', label: 'Галерея', accept: 'image/*,video/*' },
  { id: 'file', icon: 'file', label: 'Файл', accept: ALL_FILES_ACCEPT },
];

export function AttachSheet({ onClose, onFilesSelected }: AttachSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const desktop = useLayoutMode() === 'desktop';

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  function openPicker(accept: string): void {
    const input = inputRef.current;
    if (!input) return;
    input.accept = accept;
    input.click();
  }

  // На десктопе выбор между «Галереей» и «Файлом» ничего не решает: обе плитки открывают один
  // и тот же проводник Windows, а accept «Файла» — надмножество галереи. Поэтому проводник
  // открывается сразу по скрепке, без промежуточной карточки. Отмена в проводнике не рождает
  // события change, поэтому закрытие ловится отдельным cancel.
  // Раскладка, с которой карточка открылась. Если окно перетащили через брейкпоинт, пока она
  // висит, повторный input.click() браузер уже отклонит — жеста пользователя за ним нет, —
  // поэтому такой случай просто закрывается, а не оставляет скрепку нажатой навсегда.
  const openedOnDesktop = useRef(desktop);

  useEffect(() => {
    if (!openedOnDesktop.current) {
      if (desktop) closeRef.current();
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    const handleCancel = (): void => closeRef.current();
    input.addEventListener('cancel', handleCancel);
    openPicker(ALL_FILES_ACCEPT);
    return () => input.removeEventListener('cancel', handleCancel);
  }, [desktop]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files ? [...event.target.files] : [];
    event.target.value = '';
    if (files.length > 0) onFilesSelected(files);
    else onClose();
  }

  const input = <input ref={inputRef} type="file" multiple className={styles.hiddenInput} onChange={handleChange} />;

  if (openedOnDesktop.current) return input;

  return (
    <Sheet title="Отправить" onClose={onClose}>
      {input}
      <div className={styles.grid}>
        {TILES.map((tile) => (
          <button key={tile.id} type="button" className={styles.tile} onClick={() => openPicker(tile.accept)}>
            <span className={styles.tileIcon}>
              <Icon name={tile.icon} size={24} />
            </span>
            <span className={styles.tileLabel}>{tile.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
