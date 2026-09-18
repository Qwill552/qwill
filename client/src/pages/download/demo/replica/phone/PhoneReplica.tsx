import { AttachSheet } from './AttachSheet';
import { ChatScreen } from './ChatScreen';
import { ChatsScreen } from './ChatsScreen';
import { DIALOG, type ReplicaState } from './demoData';
import { MessageMenu } from './MessageMenu';
import styles from './PhoneReplica.module.css';

interface PhoneReplicaProps {
  state: ReplicaState;
}

export function PhoneReplica({ state }: PhoneReplicaProps) {
  const menuMessage =
    state.overlay === 'menu' ? (DIALOG.find((message) => message.id === state.menuMessageId) ?? null) : null;

  return (
    <div className={styles.replica}>
      {state.screen === 'chats' ? (
        <ChatsScreen scroll={state.chatsScroll} />
      ) : (
        <ChatScreen state={state} hiddenMessageId={menuMessage?.id ?? null} />
      )}

      {menuMessage && (
        <MessageMenu message={menuMessage} top={state.menuAnchor.top} left={state.menuAnchor.left} />
      )}

      {state.overlay === 'attach' && <AttachSheet />}
    </div>
  );
}
