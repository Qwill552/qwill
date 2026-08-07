import type { LocalMessage } from '../../stores/chatStore';
import { parseEmoji } from '../emoji/parseEmoji';
import { Icon } from '../../ui/Icon';
import styles from './MessageComposer.module.css';

export type ComposerContextValue = { mode: 'reply' | 'edit'; message: LocalMessage };

function previewText(message: LocalMessage): string {
  if (message.deletedAt) return 'Сообщение удалено';
  if (message.content) return message.content;
  if (message.attachment?.peaks != null) return 'Голосовое сообщение';
  if (message.attachment || message.localAttachment) return 'Вложение';
  return '';
}

export function ComposerContextBar({
  context,
  onCancel,
}: {
  context: ComposerContextValue;
  onCancel: () => void;
}) {
  const editing = context.mode === 'edit';

  return (
    <div className={styles.context}>
      <div className={styles.contextBar}>
        <span className={styles.contextLabel}>
          {editing ? 'Редактирование' : `Ответ ${context.message.sender?.displayName ?? 'удалённому аккаунту'}`}
        </span>
        <span className={styles.contextText}>{parseEmoji(previewText(context.message))}</span>
      </div>
      <button type="button" className={styles.contextCancel} onClick={onCancel} aria-label="Отменить" title="Отменить">
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
