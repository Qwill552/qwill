import { useRef } from 'react';

import type { DemoReadout } from '../../engine/store';
import { AttachSheet } from './AttachSheet';
import { CallScreen } from './CallScreen';
import { ChatScreen } from './ChatScreen';
import { ChatsScreen } from './ChatsScreen';
import { cx } from './Chrome';
import { DIALOG, type ReplicaState, type ScreenSurface } from './demoData';
import { MessageMenu } from './MessageMenu';
import styles from './PhoneReplica.module.css';
import { ProfileScreen } from './ProfileScreen';
import { QrCard } from './QrCard';
import { SettingsScreen } from './SettingsScreen';
import { WallpaperScreen } from './WallpaperScreen';

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
  const pushed = state.screen !== 'chats';

  return (
    <div className={styles.replica} ref={rootRef}>
      <div className={cx(styles.layer, styles.root, pushed && styles.rootPushed)}>
        <ChatsScreen surface={chatsSurface} pressed={state.pressed} />
        <span className={cx(styles.scrim, pushed && styles.scrimLit)} />
      </div>

      <div className={cx(styles.layer, styles.pushed, pushed && styles.pushedOpen)}>
        {state.screen === 'chat' && (
          <ChatScreen
            state={state}
            hiddenMessageId={menuMessage?.id ?? null}
            surface={feedSurface}
            typingReadout={typingReadout}
            voiceReadout={voiceReadout}
          />
        )}
        {state.screen === 'profile' && <ProfileScreen />}
        {state.screen === 'wallpaper' && <WallpaperScreen />}
        {state.screen === 'call' && <CallScreen />}
        {state.screen === 'qr' && <QrCard />}
        {state.screen === 'settings' && <SettingsScreen />}
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
