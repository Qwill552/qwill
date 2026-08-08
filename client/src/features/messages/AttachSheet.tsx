import { ALLOWED_MIME_TYPES } from '@messenger/shared';
import { useRef } from 'react';

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

const TILES: Tile[] = [
  { id: 'gallery', icon: 'image', label: 'Галерея', accept: 'image/*,video/*' },
  { id: 'file', icon: 'file', label: 'Файл', accept: ALLOWED_MIME_TYPES.join(',') },
];

export function AttachSheet({ onClose, onFilesSelected }: AttachSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acceptRef = useRef('');

  function openPicker(accept: string): void {
    acceptRef.current = accept;
    const input = inputRef.current;
    if (!input) return;
    input.accept = accept;
    input.click();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files ? [...event.target.files] : [];
    event.target.value = '';
    if (files.length > 0) onFilesSelected(files);
    else onClose();
  }

  return (
    <Sheet title="Отправить" onClose={onClose}>
      <input ref={inputRef} type="file" multiple className={styles.hiddenInput} onChange={handleChange} />
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
