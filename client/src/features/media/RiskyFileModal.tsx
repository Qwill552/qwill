import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Switch } from '../../ui/Switch';
import { Modal } from '../groups/Modal';
import { fileExtension } from './fileKind';
import styles from './RiskyFileModal.module.css';

interface RiskyFileModalProps {
  fileName: string;
  onCancel: () => void;
  onConfirm: (mute: boolean) => void;
}

export function RiskyFileModal({ fileName, onCancel, onConfirm }: RiskyFileModalProps) {
  const [mute, setMute] = useState(false);
  const extension = fileExtension(fileName);

  function stopPointerBubble(event: React.PointerEvent): void {
    event.stopPropagation();
  }

  return createPortal(
    <div
      onPointerDown={stopPointerBubble}
      onPointerMove={stopPointerBubble}
      onPointerUp={stopPointerBubble}
      onPointerCancel={stopPointerBubble}
    >
      <Modal title="Открыть файл?" onClose={onCancel} className={styles.overlay} opaque>
        <p className={styles.text}>
          Этот файл имеет расширение «.{extension}». Вы уверены, что хотите его открыть?
        </p>

        <label className={styles.switchRow}>
          <span id="risky-file-dont-ask">Больше не спрашивать</span>
          <Switch checked={mute} onChange={setMute} labelledBy="risky-file-dont-ask" />
        </label>

        <div className={styles.actions}>
          <button className={styles.cancelButton} type="button" onClick={onCancel}>
            Отмена
          </button>
          <button className={styles.openButton} type="button" onClick={() => onConfirm(mute)}>
            Открыть
          </button>
        </div>
      </Modal>
    </div>,
    document.body,
  );
}
