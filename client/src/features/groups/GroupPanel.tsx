import { AVATAR_MIME_TYPES, CHAT_TITLE_MAX_LENGTH } from '@messenger/shared';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { ApiError } from '../../api/client';
import { uploadFile } from '../../api/files';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { useChatStore } from '../../stores/chatStore';
import styles from './GroupPanel.module.css';
import { Modal } from './Modal';

interface GroupPanelProps {
  chatId: string;
  onClose: () => void;
}

/** «N участников» с русским склонением числительного. */
function membersLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'участник' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'участника' : 'участников';
  return `${count} ${word}`;
}

/** Панель управления группой — участники/роли, название/аватар, выход, передача владения.
 *  Своего экрана в референсе нет (CLAUDE.md, этап 6): расширение стеклянного языка,
 *  утверждённого на этапах 0-5, а не буквальный перенос. */
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
      <div className={styles.hero}>
        <button
          className={styles.avatarButton}
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={!canManage || avatarUploading}
          title={canManage ? 'Сменить аватар группы' : undefined}
          aria-label={canManage ? 'Сменить аватар группы' : undefined}
        >
          <Avatar label={chat?.title ?? '?'} avatarUrl={chat?.avatarUrl} size={88} colorKey={chatId} />
          {canManage && (
            <span className={styles.avatarEdit}>
              <Icon name="camera" size={16} />
            </span>
          )}
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
            <button
              className={styles.saveButton}
              type="button"
              onClick={() => void handleTitleSave()}
              disabled={pendingAction === 'title'}
              aria-label="Сохранить название"
            >
              <Icon name="check" size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.titleButton}
            onClick={() => canManage && setTitleEditing(true)}
            disabled={!canManage}
          >
            <span className={styles.titleText}>{chat?.title}</span>
            {canManage && <Icon name="edit" size={14} className={styles.titleEditIcon} />}
          </button>
        )}

        <span className={styles.memberCount}>{membersLabel(members.length)}</span>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {canManage && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Добавить участника</h3>
          <form className={styles.addRow} onSubmit={(e) => void handleAddMember(e)}>
            <input
              className={styles.input}
              placeholder="@username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
            />
            <IconButton
              icon="user-plus"
              label="Добавить участника"
              variant="primary"
              type="submit"
              disabled={!usernameInput.trim() || pendingAction === 'add'}
            />
          </form>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Участники ({members.length})</h3>
        <div className={styles.card}>
          {members.map((member) => {
            const isSelf = member.userId === myUserId;
            const canRemove = canManage && !isSelf && member.role !== 'OWNER';
            const canToggleRole = isOwner && !isSelf && member.role !== 'OWNER';
            const canTransfer = isOwner && !isSelf;

            return (
              <div key={member.userId} className={styles.member}>
                <Avatar label={member.displayName} avatarUrl={member.avatarUrl} size={40} color={member.avatarColor} />
                <div className={styles.memberBody}>
                  <span className={styles.memberName}>
                    {member.displayName}
                    {isSelf && ' (вы)'}
                  </span>
                  <span className={styles.memberRole}>
                    {member.role === 'OWNER' ? 'Владелец' : member.role === 'ADMIN' ? 'Администратор' : 'Участник'}
                  </span>
                </div>
                <div className={styles.memberActions}>
                  {canToggleRole && (
                    <IconButton
                      icon="shield"
                      label={member.role === 'ADMIN' ? 'Снять администратора' : 'Назначить администратором'}
                      size={18}
                      className={member.role === 'ADMIN' ? styles.actionActive : undefined}
                      disabled={pendingAction === member.userId}
                      onClick={() => void handleToggleRole(member.userId, member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN')}
                    />
                  )}
                  {canTransfer && (
                    <IconButton
                      icon="crown"
                      label="Передать права владельца"
                      size={18}
                      disabled={pendingAction === member.userId}
                      onClick={() => void handleTransferOwnership(member.userId, member.username)}
                    />
                  )}
                  {canRemove && (
                    <IconButton
                      icon={confirmRemove === member.userId ? 'check' : 'user-minus'}
                      label={confirmRemove === member.userId ? 'Нажмите ещё раз, чтобы исключить' : 'Исключить'}
                      variant="danger"
                      size={18}
                      disabled={pendingAction === member.userId}
                      onClick={() => void handleRemove(member.userId)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <button className={styles.leaveButton} type="button" onClick={() => void handleLeave()} disabled={pendingAction === 'leave'}>
        <Icon name="logout" size={18} />
        {confirmLeave ? 'Точно покинуть группу?' : 'Покинуть группу'}
      </button>
    </Modal>
  );
}
