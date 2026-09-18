import { AttachSheet } from './AttachSheet';
import { ChatScreen } from './ChatScreen';
import { ChatsScreen } from './ChatsScreen';
import { cx } from './Chrome';
import {
  DIALOG,
  MENU_ANCHOR_FALLBACK,
  MENU_ANCHORS,
  type ReplicaState,
  type ScreenSurface,
} from './demoData';
import { MessageMenu } from './MessageMenu';
import styles from './PhoneReplica.module.css';

interface PhoneReplicaProps {
  state: ReplicaState;
  chatsSurface?: ScreenSurface;
  feedSurface?: ScreenSurface;
}

export function PhoneReplica({ state, chatsSurface, feedSurface }: PhoneReplicaProps) {
  const menuMessage =
    state.overlay === 'menu' ? (DIALOG.find((message) => message.id === state.menuMessageId) ?? null) : null;
  const anchor = (menuMessage && MENU_ANCHORS[menuMessage.id]) ?? MENU_ANCHOR_FALLBACK;
  const inChat = state.screen === 'chat';

  return (
    <div className={styles.replica}>
      <div className={cx(styles.layer, styles.root, inChat && styles.rootPushed)}>
        <ChatsScreen surface={chatsSurface} />
        <span className={cx(styles.scrim, inChat && styles.scrimLit)} />
      </div>

      <div className={cx(styles.layer, styles.pushed, inChat && styles.pushedOpen)}>
        <ChatScreen state={state} hiddenMessageId={menuMessage?.id ?? null} surface={feedSurface} />
      </div>

      {menuMessage && <MessageMenu message={menuMessage} top={anchor.top} left={anchor.left} />}

      {state.overlay === 'attach' && <AttachSheet />}
    </div>
  );
}
