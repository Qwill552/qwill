import { useLayoutMode } from '../../app/useLayoutMode';
import { Avatar } from '../../ui/Avatar';
import { Sheet } from '../../ui/Sheet';
import { useChatStore } from '../../stores/chatStore';
import { Modal } from '../groups/Modal';
import styles from './ChatSearchFromPicker.module.css';

interface ChatSearchFromPickerProps {
  chatId: string;
  onPick: (userId: string) => void;
  onClose: () => void;
}

export function ChatSearchFromPicker({ chatId, onPick, onClose }: ChatSearchFromPickerProps) {
  const members = useChatStore((s) => s.membersByChat[chatId]) ?? [];
  const desktop = useLayoutMode() === 'desktop';

  const body = (
    <div className={styles.list}>
        {members.map((member) => (
          <button
            key={member.userId}
            type="button"
            className={styles.row}
            onClick={() => {
              onPick(member.userId);
              onClose();
            }}
          >
            <Avatar
              label={member.displayName}
              avatarUrl={member.avatarUrl}
              size={40}
              color={member.avatarColor}
              colorKey={member.userId}
            />
            <span className={styles.name}>{member.displayName}</span>
          </button>
        ))}
      {members.length === 0 && <p className={styles.hint}>Участники ещё не загружены</p>}
    </div>
  );

  if (desktop) {
    return (
      <Modal title="От кого" onClose={onClose}>
        {body}
      </Modal>
    );
  }

  return (
    <Sheet title="От кого" onClose={onClose}>
      {body}
    </Sheet>
  );
}
