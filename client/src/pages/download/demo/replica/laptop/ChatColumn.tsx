import { DayDivider, MessageRow } from '../phone/Bubble';
import { Avatar, cx } from '../phone/Chrome';
import { Composer } from '../phone/Composer';
import {
  DESKTOP_TEXT,
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

function EmptyChat() {
  return (
    <div className={styles.empty}>
      <svg className={styles.emptyArt} width="112" height="112" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="56" fill="var(--primary-soft)" />
        <path
          d="M34 46a10 10 0 0 1 10-10h32a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H52l-12 10v-10h-6a10 10 0 0 1-10-10V46Z"
          fill="var(--surface)"
          stroke="var(--primary)"
          strokeWidth="3"
        />
        <circle cx="52" cy="56" r="3.5" fill="var(--primary)" />
        <circle cx="64" cy="56" r="3.5" fill="var(--primary)" />
        <circle cx="76" cy="56" r="3.5" fill="var(--primary)" />
      </svg>
      <p className={styles.emptyTitle}>{DESKTOP_TEXT.emptyTitle}</p>
      <p className={styles.emptySubtitle}>{DESKTOP_TEXT.emptySubtitle}</p>
    </div>
  );
}

export function ChatColumn({ state, feedSurface, typingReadout, voiceReadout }: ChatColumnProps) {
  const messages = DIALOG.slice(0, state.visibleMessages);
  const open = state.screen !== 'chats';

  return (
    <div className={styles.column}>
      <div className={cx(styles.emptyLayer, open && styles.emptyLayerGone)}>
        <EmptyChat />
      </div>

      <div className={cx(styles.chat, open && styles.chatOpen)}>
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
    </div>
  );
}
