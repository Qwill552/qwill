import { AVATAR_MIME_TYPES, CHAT_TITLE_MAX_LENGTH } from '@messenger/shared';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { ApiError } from '../../api/client';
import { uploadFile } from '../../api/files';
import { Avatar } from '../chats/Avatar';
import { useChatStore } from '../../stores/chatStore';
import styles from './GroupPanel.module.css';
import { Modal } from './Modal';

interface GroupPanelProps {
  chatId: string;
  onClose: () => void;
}

/** Панель управления группой — участники/роли, название/аватар, выход, передача владения (этап 7). */
export function GroupPanel({ chatId, onClose }: GroupPanelProps) {
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const members = useChatStore((s) => s.membersByChat[chatId]) ?? [];
  const myUserId = useChatStore((s) => s.myUserId);
  const loadMembers = useChatStore((s) => s.loadMembers);
  const addMember = useChatStore((s) => s.addMember);
  const removeMember = useChatStore((s) => s.removeMember);
  const updateMemberRole = useChatStore((s) => s.updateMemberRole);
  const leaveGroup = useChatStore((s) => s.leaveGroup);
  const transferOwnership = useChatStore((s) => s.transferOwnership);
  const updateGroupInfo = useChatStore((s) => s.updateGroupInfo);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [titleDraft, setTitleDraft] = useState(chat?.title ?? '');
  const [titleEditing, setTitleEditing] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    void loadMembers(chatId);
  }, [chatId, loadMembers]);

  useEffect(() => {
    setTitleDraft(chat?.title ?? '');
  }, [chat?.title]);

  const myRole = members.find((m) => m.userId === myUserId)?.role;
  const canManage = myRole === 'OWNER' || myRole === 'ADMIN';
  const isOwner = myRole === 'OWNER';

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setAvatarUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file, 'avatar');
      await updateGroupInfo(chatId, { avatar: { fileId: uploaded.id, sha256: uploaded.sha256 } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сменить аватар');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleTitleSave(): Promise<void> {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === chat?.title) {
      setTitleEditing(false);
      return;
    }
    setPendingAction('title');
    setError(null);
    try {
      await updateGroupInfo(chatId, { title: trimmed });
      setTitleEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сменить название');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleAddMember(event: FormEvent): Promise<void> {
    event.preventDefault();
    const value = usernameInput.trim().replace(/^@/, '').toLowerCase();
    if (!value) return;

    setPendingAction('add');
    setError(null);
    try {
      await addMember(chatId, value);
      setUsernameInput('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось добавить участника');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemove(userId: string): Promise<void> {
    if (confirmRemove !== userId) {
      setConfirmRemove(userId);
      return;
    }
    setPendingAction(userId);
    setError(null);
    try {
      await removeMember(chatId, userId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось исключить участника');
    } finally {
      setPendingAction(null);
      setConfirmRemove(null);
    }
  }

  async function handleToggleRole(userId: string, role: 'ADMIN' | 'MEMBER'): Promise<void> {
    setPendingAction(userId);
    setError(null);
    try {
      await updateMemberRole(chatId, userId, role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось изменить роль');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleTransferOwnership(userId: string, username: string): Promise<void> {
    setPendingAction(userId);
    setError(null);
    try {
      await transferOwnership(chatId, username);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось передать владение');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleLeave(): Promise<void> {
    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    setPendingAction('leave');
    setError(null);
    try {
      await leaveGroup(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось покинуть группу');
      setPendingAction(null);
    }
  }

  return (
    <Modal title="Информация о группе" onClose={onClose}>
      <div className={styles.avatarRow}>
        <button
          className={styles.avatarButton}
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={!canManage || avatarUploading}
          title={canManage ? 'Сменить аватар группы' : undefined}
          aria-label={canManage ? 'Сменить аватар группы' : undefined}
        >
          <Avatar label={chat?.title ?? '?'} avatarUrl={chat?.avatarUrl} size={56} />
        </button>
        {canManage && (
          <input
            ref={avatarInputRef}
            className={styles.hiddenInput}
            type="file"
            accept={AVATAR_MIME_TYPES.join(',')}
            onChange={(e) => void handleAvatarChange(e)}
          />
        )}

        {titleEditing ? (
          <div className={styles.titleRow}>
            <input
              className={styles.titleInput}
              value={titleDraft}
              maxLength={CHAT_TITLE_MAX_LENGTH}
              onChange={(e) => setTitleDraft(e.target.value)}
              autoFocus
            />
            <button className={styles.saveButton} type="button" onClick={() => void handleTitleSave()} disabled={pendingAction === 'title'}>
              Сохранить
            </button>
          </div>
        ) : (
          <span
            className={styles.titleText}
            onClick={() => canManage && setTitleEditing(true)}
            style={canManage ? { cursor: 'pointer' } : undefined}
            title={canManage ? 'Изменить название' : undefined}
          >
            {chat?.title}
          </span>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {canManage && (
        <>
          <p className={styles.sectionTitle}>Добавить участника</p>
          <form className={styles.addRow} onSubmit={(e) => void handleAddMember(e)}>
            <input
              className={styles.input}
              placeholder="@username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
            />
            <button className={styles.addButton} type="submit" disabled={!usernameInput.trim() || pendingAction === 'add'}>
              Добавить
            </button>
          </form>
        </>
      )}

      <p className={styles.sectionTitle}>Участники ({members.length})</p>
      <div className={styles.members}>
        {members.map((member) => {
          const isSelf = member.userId === myUserId;
          const canRemove = canManage && !isSelf && member.role !== 'OWNER';
          const canToggleRole = isOwner && !isSelf && member.role !== 'OWNER';
          const canTransfer = isOwner && !isSelf;

          return (
            <div key={member.userId} className={styles.member}>
              <Avatar label={member.displayName} avatarUrl={member.avatarUrl} size={40} />
              <div className={styles.memberBody}>
                <div className={styles.memberName}>
                  {member.displayName}
                  {isSelf && ' (вы)'}
                </div>
                <div className={styles.memberRole}>
                  {member.role === 'OWNER' ? 'Владелец' : member.role === 'ADMIN' ? 'Администратор' : 'Участник'}
                </div>
              </div>
              <div className={styles.memberActions}>
                {canToggleRole && (
                  <button
                    className={styles.iconButton}
                    type="button"
                    title={member.role === 'ADMIN' ? 'Снять администратора' : 'Назначить администратором'}
                    aria-label={member.role === 'ADMIN' ? 'Снять администратора' : 'Назначить администратором'}
                    disabled={pendingAction === member.userId}
                    onClick={() => void handleToggleRole(member.userId, member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN')}
                  >
                    {member.role === 'ADMIN' ? '⭣' : '⭡'}
                  </button>
                )}
                {canTransfer && (
                  <button
                    className={styles.iconButton}
                    type="button"
                    title="Передать права владельца"
                    aria-label="Передать права владельца"
                    disabled={pendingAction === member.userId}
                    onClick={() => void handleTransferOwnership(member.userId, member.username)}
                  >
                    👑
                  </button>
                )}
                {canRemove && (
                  <button
                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                    type="button"
                    title={confirmRemove === member.userId ? 'Нажмите ещё раз, чтобы исключить' : 'Исключить'}
                    aria-label="Исключить"
                    disabled={pendingAction === member.userId}
                    onClick={() => void handleRemove(member.userId)}
                  >
                    {confirmRemove === member.userId ? '✓' : '✕'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button className={styles.leaveButton} type="button" onClick={() => void handleLeave()} disabled={pendingAction === 'leave'}>
          {confirmLeave ? 'Точно покинуть группу?' : 'Покинуть группу'}
        </button>
      </div>
    </Modal>
  );
}
