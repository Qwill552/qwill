import { LAPTOP_CURSOR } from '../../../config';
import type { DemoReadout } from '../../engine/store';
import { CallScreen } from '../phone/CallScreen';
import { DIALOG, REPLICA_REST, type ReplicaState, type ScreenSurface } from '../phone/demoData';
import { ChatColumn } from './ChatColumn';
import { ChatList } from './ChatList';
import { Cursor } from './Chrome';
import { ContextMenu } from './ContextMenu';
import { InfoScreens } from './InfoScreens';
import styles from './LaptopReplica.module.css';

export interface MenuPoint {
  x: number;
  y: number;
}

interface LaptopReplicaProps {
  state?: ReplicaState;
  listSurface?: ScreenSurface;
  feedSurface?: ScreenSurface;
  typingReadout?: DemoReadout;
  voiceReadout?: DemoReadout;
  callSecondsReadout?: DemoReadout;
  pointer?: DemoReadout;
  pointerAway?: boolean;
  menuPoint?: MenuPoint | null;
}

export function LaptopReplica({
  state = REPLICA_REST,
  listSurface,
  feedSurface,
  typingReadout,
  voiceReadout,
  callSecondsReadout,
  pointer,
  pointerAway,
  menuPoint,
}: LaptopReplicaProps) {
  const menuMessage = DIALOG.find((message) => message.id === state.menuMessageId) ?? null;
  const overlayScreen = state.screen !== 'chats' && state.screen !== 'chat' ? state.screen : null;
  const anchor = menuPoint ?? LAPTOP_CURSOR.bubble;

  return (
    <div className={styles.replica}>
      <div className={styles.columns}>
        <ChatList state={state} surface={listSurface} />
        <ChatColumn
          state={state}
          feedSurface={feedSurface}
          typingReadout={typingReadout}
          voiceReadout={voiceReadout}
        />
      </div>

      {overlayScreen === 'call' && (
        <div className={styles.callLayer}>
          <CallScreen connected={state.callConnected} secondsReadout={callSecondsReadout} />
        </div>
      )}

      {overlayScreen && overlayScreen !== 'call' && (
        <InfoScreens screen={overlayScreen} wallpaperIndex={state.wallpaperIndex} />
      )}

      {menuMessage && state.overlay === 'menu' && (
        <ContextMenu picked={state.menuPick} x={anchor.x} y={anchor.y} />
      )}

      <Cursor pointer={pointer} down={state.pressed !== null} hidden={pointerAway} />
    </div>
  );
}
