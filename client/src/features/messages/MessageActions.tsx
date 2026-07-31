import { REACTION_EMOJIS } from '@messenger/shared';
import { useState } from 'react';

import styles from './MessageActions.module.css';

interface MessageActionsProps {
  own: boolean;
  canModify: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
}

/** Тулбар у пузыря: реакция/ответ всегда, правка/удаление только для своих неудалённых сообщений. */
export function MessageActions({ own, canModify, onReply, onEdit, onDelete, onReact }: MessageActionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDeleteClick(): void {
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
      return;
    }
    setPickerOpen(false);
    setConfirmDelete(true);
  }

  return (
    <div className={styles.actions}>
      {pickerOpen &&
        REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={styles.button}
            onClick={() => {
              onReact(emoji);
              setPickerOpen(false);
            }}
          >
            {emoji}
          </button>
        ))}
      <button
        type="button"
        className={styles.button}
        title="Реакция"
        aria-label="Реакция"
        onClick={() => {
          setConfirmDelete(false);
          setPickerOpen((v) => !v);
        }}
      >
        🙂
      </button>
      <button
        type="button"
        className={styles.button}
        title="Ответить"
        aria-label="Ответить"
        onClick={() => {
          setPickerOpen(false);
          setConfirmDelete(false);
          onReply();
        }}
      >
        ↩
      </button>
      {own && canModify && (
        <button
          type="button"
          className={styles.button}
          title="Редактировать"
          aria-label="Редактировать"
          onClick={() => {
            setPickerOpen(false);
            setConfirmDelete(false);
            onEdit();
          }}
        >
          ✎
        </button>
      )}
      {own && canModify && (
        <button
          type="button"
          className={`${styles.button} ${confirmDelete ? styles.danger : ''}`}
          title={confirmDelete ? 'Нажмите ещё раз, чтобы удалить' : 'Удалить'}
          aria-label="Удалить"
          onClick={handleDeleteClick}
        >
          {confirmDelete ? '✓' : '🗑'}
        </button>
      )}
    </div>
  );
}
