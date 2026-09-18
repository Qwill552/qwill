import { useRef } from 'react';

import type { DemoReadout } from '../../engine/store';
import { AttachSheet } from './AttachSheet';
import { ChatScreen } from './ChatScreen';
import { ChatsScreen } from './ChatsScreen';
import { cx } from './Chrome';
import { DIALOG, type ReplicaState, type ScreenSurface } from './demoData';
import { MessageMenu } from './MessageMenu';
import styles from './PhoneReplica.module.css';

interface PhoneReplicaProps {
  state: ReplicaState;
  chatsSurface?: ScreenSurface;
  feedSurface?: ScreenSurface;
  typingReadout?: DemoReadout;
  voiceReadout?: DemoReadout;
}

export function PhoneReplica({
  state,
  chatsSurface,
  feedSurface,
  typingReadout,
  voiceReadout,
}: PhoneReplicaProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuMessage = DIALOG.find((message) => message.id === state.menuMessageId) ?? null;
  const inChat = state.screen === 'chat';

  return (
    <div className={styles.replica} ref={rootRef}>
      <div className={cx(styles.layer, styles.root, inChat && styles.rootPushed)}>
        <ChatsScreen surface={chatsSurface} />
        <span className={cx(styles.scrim, inChat && styles.scrimLit)} />
      </div>

      <div className={cx(styles.layer, styles.pushed, inChat && styles.pushedOpen)}>
        <ChatScreen
          state={state}
          hiddenMessageId={menuMessage?.id ?? null}
          surface={feedSurface}
          typingReadout={typingReadout}
          voiceReadout={voiceReadout}
        />
      </div>

      {menuMessage && (
        <MessageMenu
          message={menuMessage}
          rootRef={rootRef}
          open={state.overlay === 'menu'}
          picked={state.menuPick}
        />
      )}

      {state.overlay === 'attach' && <AttachSheet />}
    </div>
  );
}
