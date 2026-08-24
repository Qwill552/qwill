import { useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';

import { useEscapeKey } from '../../app/hotkeys';
import { useBackHandler } from '../../app/useBackHandler';
import { Icon } from '../../ui/Icon';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import styles from './Modal.module.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  opaque?: boolean;
}

/** Общая карточка-оверлей для модалок группы (создание, панель управления) — своего reusable-модала в проекте ещё не было. */
export function Modal({ title, onClose, children, opaque }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  useBackHandler(true, onClose);
  useEscapeKey(true, onClose);

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={cardRef}
        className={`${styles.card} ${opaque ? styles.opaque : ''} hide-native-scrollbar`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <ScrollIndicator target={cardRef} />
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
