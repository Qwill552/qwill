import { DayDivider, MessageRow } from '../phone/Bubble';
import { Avatar } from '../phone/Chrome';
import { Composer } from '../phone/Composer';
import {
  DIALOG,
  PEOPLE,
  REACTION_EMOJI,
  REPLICA_TEXT,
  type ReplicaState,
  type ScreenSurface,
} from '../phone/demoData';
import type { DemoReadout } from '../../engine/store';
import { IconBtn } from './Chrome';
import styles from './ChatColumn.module.css';

interface ChatColumnProps {
  state: ReplicaState;
  feedSurface?: ScreenSurface;
  typingReadout?: DemoReadout;
  voiceReadout?: DemoReadout;
}

export function ChatColumn({ state, feedSurface, typingReadout, voiceReadout }: ChatColumnProps) {
  const messages = DIALOG.slice(0, state.visibleMessages);

  return (
    <div className={styles.column}>
      <div className={styles.header}>
        <Avatar label={PEOPLE.artem.name} colorKey={PEOPLE.artem.id} size={40} online />
        <div className={styles.headerText}>
          <span className={styles.name}>{PEOPLE.artem.name}</span>
          <span className={styles.status}>{REPLICA_TEXT.chatSubtitle}</span>
        </div>
        <IconBtn icon="search" />
        <IconBtn icon="phone" />
      </div>

      <div className={styles.wallpaper}>
        <div className={styles.pattern} />
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
  );
}
