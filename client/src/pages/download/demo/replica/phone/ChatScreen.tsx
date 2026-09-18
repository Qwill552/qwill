import type { DemoReadout } from '../../engine/store';
import { Avatar, ChromeBar, GlassButton, HeaderPill } from './Chrome';
import { DayDivider, MessageRow } from './Bubble';
import { Composer } from './Composer';
import {
  DIALOG,
  PEOPLE,
  PRESS,
  REACTION_EMOJI,
  REPLICA_TEXT,
  type ReplicaState,
  type ScreenSurface,
} from './demoData';
import styles from './ChatScreen.module.css';

interface ChatScreenProps {
  state: ReplicaState;
  hiddenMessageId: string | null;
  surface?: ScreenSurface;
  typingReadout?: DemoReadout;
  voiceReadout?: DemoReadout;
}

export function ChatScreen({
  state,
  hiddenMessageId,
  surface,
  typingReadout,
  voiceReadout,
}: ChatScreenProps) {
  const messages = DIALOG.slice(0, state.visibleMessages);

  return (
    <div className={styles.screen}>
      <div className={styles.wallpaper}>
        <div className={styles.pattern} />
      </div>

      <div className={styles.feed} ref={surface?.viewport}>
        <div className={styles.feedInner} ref={surface?.inner}>
          {messages.map((message, index) => (
            <div key={message.id}>
              {message.day && <DayDivider label={message.day} />}
              <MessageRow
                message={message}
                read={index < state.readUpTo}
                reaction={state.reactionMessageId === message.id ? REACTION_EMOJI : null}
                held={state.pressed === message.id}
                hidden={message.id === hiddenMessageId}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.headerFade} />

      <ChromeBar className={styles.header}>
        <GlassButton icon="back" tap="chats" pressed={state.pressed === PRESS.back} />
        <HeaderPill
          title={PEOPLE.artem.name}
          subtitle={REPLICA_TEXT.chatSubtitle}
          leading={<Avatar label={PEOPLE.artem.name} colorKey={PEOPLE.artem.id} size={40} />}
        />
        <GlassButton icon="phone" />
        <GlassButton icon="more" />
      </ChromeBar>

      <div className={styles.composerFade} />

      <ChromeBar className={styles.composerBar}>
        <Composer
          text={state.composerText}
          focused={state.composerFocused}
          recording={state.recording}
          pressed={state.pressed}
          typingReadout={typingReadout}
          voiceReadout={voiceReadout}
        />
      </ChromeBar>
    </div>
  );
}
