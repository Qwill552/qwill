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
  profileSurface?: ScreenSurface;
  settingsSurface?: ScreenSurface;
  typingReadout?: DemoReadout;
  voiceReadout?: DemoReadout;
  callSecondsReadout?: DemoReadout;
  scenarioScrimLit?: boolean;
  onScenarioScrimTransitionEnd?: () => void;
}

export function PhoneReplica({
  state,
  chatsSurface,
  feedSurface,
  profileSurface,
  settingsSurface,
  typingReadout,
  voiceReadout,
  callSecondsReadout,
  scenarioScrimLit,
  onScenarioScrimTransitionEnd,
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
        {state.screen === 'profile' && <ProfileScreen surface={profileSurface} />}
        {state.screen === 'wallpaper' && <WallpaperScreen selectedIndex={state.wallpaperIndex} />}
        {state.screen === 'call' && (
          <CallScreen connected={state.callConnected} secondsReadout={callSecondsReadout} />
        )}
        {state.screen === 'qr' && <QrCard />}
        {state.screen === 'settings' && <SettingsScreen surface={settingsSurface} />}
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

      <span
        className={cx(styles.scenarioScrim, scenarioScrimLit && styles.scenarioScrimLit)}
        onTransitionEnd={onScenarioScrimTransitionEnd}
      />
    </div>
  );
}
