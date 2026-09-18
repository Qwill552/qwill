import { Avatar, ChromeBar, GlassButton, HeaderPill } from './Chrome';
import { DayDivider, MessageRow } from './Bubble';
import { Composer } from './Composer';
import { DIALOG, PEOPLE, REPLICA_TEXT, type ReplicaState } from './demoData';
import styles from './ChatScreen.module.css';

interface ChatScreenProps {
  state: ReplicaState;
  hiddenMessageId: string | null;
}

export function ChatScreen({ state, hiddenMessageId }: ChatScreenProps) {
  const messages = DIALOG.slice(0, state.visibleMessages);

  return (
    <div className={styles.screen}>
      <div className={styles.wallpaper}>
        <div className={styles.pattern} />
      </div>

      <div className={styles.feed}>
        <div className={styles.feedInner} style={{ transform: `translateY(${-state.feedScroll}px)` }}>
          {messages.map((message) => (
            <div key={message.id}>
              {message.day && <DayDivider label={message.day} />}
              <MessageRow message={message} hidden={message.id === hiddenMessageId} />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.headerFade} />

      <ChromeBar className={styles.header}>
        <GlassButton icon="back" />
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
        <Composer text={state.composerText} recording={state.recording} />
      </ChromeBar>
    </div>
  );
}
