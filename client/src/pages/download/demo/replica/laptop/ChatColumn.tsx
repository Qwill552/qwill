import { REPLICA_LOGO_MARK_SIZE } from '../../../config';
import { Logo } from '../../../header/Logo';
import type { DemoReadout } from '../../engine/store';
import { DayDivider, MessageRow } from '../phone/Bubble';
import { Avatar, cx } from '../phone/Chrome';
import { Composer } from '../phone/Composer';
import {
  CHAT_PEERS,
  DESKTOP_TEXT,
  REACTION_EMOJI,
  dialogOf,
  type ReplicaState,
  type ScreenSurface,
} from '../phone/demoData';
import { IconBtn } from './Chrome';
import styles from './ChatColumn.module.css';

interface ChatColumnProps {
  state: ReplicaState;
  feedSurface?: ScreenSurface;
  typingReadout?: DemoReadout;
  voiceReadout?: DemoReadout;
}

function EmptyChat() {
  return (
    <div className={styles.empty}>
      <span className={styles.logoTile}>
        <Logo size={REPLICA_LOGO_MARK_SIZE} />
      </span>
      <p className={styles.emptyTitle}>{DESKTOP_TEXT.emptyTitle}</p>
      <p className={styles.emptySubtitle}>{DESKTOP_TEXT.emptySubtitle}</p>
    </div>
  );
}

export function ChatColumn({ state, feedSurface, typingReadout, voiceReadout }: ChatColumnProps) {
  const peer = CHAT_PEERS[state.chatPeer];
  const messages = dialogOf(state.chatPeer).slice(0, state.visibleMessages);
  const open = state.screen !== 'chats';

  return (
    <div className={styles.column}>
      <div className={styles.wallpaper}>
        <div className={styles.pattern} />
      </div>

      <div className={cx(styles.emptyLayer, open && styles.emptyLayerGone)}>
        <EmptyChat />
      </div>

      <div className={cx(styles.chat, open && styles.chatOpen)}>
        <div className={styles.header}>
          <Avatar label={peer.name} colorKey={peer.id} size={40} online={peer.online} />
          <div className={styles.headerText}>
            <span className={styles.name}>{peer.name}</span>
            <span className={styles.status}>{peer.status}</span>
          </div>
          <IconBtn icon="search" />
          <IconBtn icon="phone" />
        </div>

        <div className={styles.feed} ref={feedSurface?.viewport}>
          <div className={styles.feedInner} ref={feedSurface?.inner}>
            {messages.map((message, index) => (
              <div key={message.id}>
                {message.day && <DayDivider label={message.day} />}
                <MessageRow
                  message={message}
                  read={index < state.readUpTo}
                  reaction={state.reactionMessageId === message.id ? REACTION_EMOJI : null}
                  held={state.pressed === message.id}
                />
              </div>
            ))}
          </div>
        </div>

        <div className={styles.composerBar}>
          <Composer
            text={state.composerText}
            focused={state.composerFocused}
            recording={state.recording}
            pressed={state.pressed}
            typingReadout={typingReadout}
            voiceReadout={voiceReadout}
          />
        </div>
      </div>
    </div>
  );
}
