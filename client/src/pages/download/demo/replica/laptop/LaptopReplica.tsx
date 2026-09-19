import { CallScreen } from '../phone/CallScreen';
import { DIALOG, REPLICA_REST, type ReplicaState } from '../phone/demoData';
import { ChatColumn } from './ChatColumn';
import { ChatList } from './ChatList';
import { ContextMenu } from './ContextMenu';
import { InfoScreens } from './InfoScreens';
import styles from './LaptopReplica.module.css';

const MENU_ORIGIN = { top: 420, left: 460 } as const;

interface LaptopReplicaProps {
  state?: ReplicaState;
}

export function LaptopReplica({ state = REPLICA_REST }: LaptopReplicaProps) {
  const menuMessage = DIALOG.find((message) => message.id === state.menuMessageId) ?? null;
  const overlayScreen = state.screen !== 'chats' && state.screen !== 'chat' ? state.screen : null;

  return (
    <div className={styles.replica}>
      <div className={styles.columns}>
        <ChatList pressed={state.pressed} />
        <ChatColumn state={state} />
      </div>

      {overlayScreen === 'call' && (
        <div className={styles.callLayer}>
          <CallScreen connected={state.callConnected} />
        </div>
      )}

      {overlayScreen && overlayScreen !== 'call' && (
        <InfoScreens screen={overlayScreen} wallpaperIndex={state.wallpaperIndex} />
      )}

      {menuMessage && state.overlay === 'menu' && (
        <ContextMenu picked={state.menuPick} top={MENU_ORIGIN.top} left={MENU_ORIGIN.left} />
      )}
    </div>
  );
}
