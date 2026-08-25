import type { ChatListItemDto } from '@messenger/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { useChatStore } from '../../stores/chatStore';
import { Switch } from '../../ui/Switch';
import { isServiceChat } from '../chat/serviceChat';
import { Modal } from '../groups/Modal';
import styles from './DeleteChatModal.module.css';

interface DeleteChatModalProps {
  chat: ChatListItemDto;
  onClose: () => void;
}

/** Диалог удаления чата — у себя или сразу у обоих (R-11, repair/11-delete-chat.md). */
export function DeleteChatModal({ chat, onClose }: DeleteChatModalProps) {
  const deleteChat = useChatStore((s) => s.deleteChat);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const navigate = useNavigate();

  const [forEveryone, setForEveryone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showCheckbox = !isServiceChat(chat) && chat.type === 'PRIVATE' && chat.otherMember;

  async function handleDelete(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await deleteChat(chat.id, forEveryone);
      if (activeChatId === chat.id) navigate('/chats');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить чат');
      setPending(false);
    }
  }

  return (
    <Modal title="Удалить чат?" onClose={onClose}>
      <p className={styles.text}>
        {chat.otherMember ? `Переписка с @${chat.otherMember.username} будет удалена.` : `Переписка «${chat.title}» будет удалена.`}
      </p>

      {showCheckbox && (
        <label className={styles.switchRow}>
          <span id="delete-chat-for-everyone">Удалить также у @{chat.otherMember!.username}</span>
          <Switch checked={forEveryone} onChange={setForEveryone} labelledBy="delete-chat-for-everyone" />
        </label>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button className={styles.cancelButton} type="button" onClick={onClose} disabled={pending}>
          Отмена
        </button>
        <button className={styles.deleteButton} type="button" onClick={() => void handleDelete()} disabled={pending}>
          Удалить
        </button>
      </div>
    </Modal>
  );
}
