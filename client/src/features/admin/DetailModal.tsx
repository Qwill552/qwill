import type { ReactNode } from 'react';

import { Modal } from '../groups/Modal';
import styles from './DetailModal.module.css';

export interface DetailField {
  label: string;
  value: ReactNode;
  /** Длинное значение — своя строка под подписью, с переносами и моноширинным начертанием. */
  block?: boolean;
}

interface DetailModalProps {
  title: string;
  fields: DetailField[];
  footer?: ReactNode;
  onClose: () => void;
}

export function DetailModal({ title, fields, footer, onClose }: DetailModalProps) {
  return (
    <Modal title={title} onClose={onClose} className={styles.overlay} opaque>
      <dl className={styles.list}>
        {fields.map((field) => (
          <div key={field.label} className={field.block ? styles.blockItem : styles.item}>
            <dt className={styles.label}>{field.label}</dt>
            <dd className={field.block ? styles.blockValue : styles.value}>{field.value}</dd>
          </div>
        ))}
      </dl>
      {footer && <div className={styles.footer}>{footer}</div>}
    </Modal>
  );
}
