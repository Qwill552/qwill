import { Icon } from '../../../../../ui/Icon';
import { cx } from './Chrome';
import {
  ALBUM_PHOTOS,
  REPLICA_EMOJI_SIZE,
  REPLICA_TEXT,
  VOICE_PEAKS,
  type ReplicaMessage,
} from './demoData';
import { ReplicaEmoji } from './ReplicaEmoji';
import styles from './Bubble.module.css';

const META_PAD = { own: 68, other: 46 } as const;
const VOICE_BAR_MIN_HEIGHT = 12;

export function DayDivider({ label }: { label: string }) {
  return (
    <div className={styles.dayWrap}>
      <span className={styles.day}>{label}</span>
    </div>
  );
}

type MetaVariant = 'anchored' | 'overlay' | 'inBubble' | 'inline';

interface MetaProps {
  message: ReplicaMessage;
  read: boolean;
  variant?: MetaVariant;
}

function Meta({ message, read, variant = 'anchored' }: MetaProps) {
  return (
    <span
      className={cx(
        styles.meta,
        variant === 'overlay' && styles.metaOverlay,
        variant === 'anchored' && styles.metaAnchored,
        variant === 'inBubble' && styles.metaInBubble,
        variant === 'inline' && styles.metaInline,
        message.own && styles.metaOnOut,
      )}
    >
      {message.time}
      {message.own && (
        <Icon name={read ? 'check-double' : 'check'} size={15} className={styles.check} />
      )}
    </span>
  );
}

function Album() {
  const [lead, ...rest] = ALBUM_PHOTOS;

  return (
    <div className={styles.album}>
      <div className={styles.albumLead}>
        {lead && <img className={styles.albumTile} src={lead.src} alt="" draggable={false} />}
      </div>
      <div className={styles.albumRest}>
        {rest.map((photo) => (
          <div key={photo.src} className={styles.albumCell}>
            <img className={styles.albumTile} src={photo.src} alt="" draggable={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Voice({ message, read }: { message: ReplicaMessage; read: boolean }) {
  return (
    <>
      <div className={cx(styles.voiceHead, message.own && styles.voiceHeadOwn)}>
        <span className={styles.voicePlay}>
          <Icon name="play" size={22} />
        </span>
        <div className={styles.voiceWave}>
          {VOICE_PEAKS.map((peak, index) => (
            <span
              key={`${peak}-${index}`}
              className={styles.voiceBar}
              style={{ height: `${Math.max(VOICE_BAR_MIN_HEIGHT, peak * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <div
        className={styles.voiceFoot}
        style={{ paddingRight: `${message.own ? META_PAD.own : META_PAD.other}px` }}
      >
        <span className={styles.voiceDuration}>{message.voiceDuration}</span>
        <span className={styles.voiceDot} />
        <span className={styles.voiceSpeed}>{REPLICA_TEXT.voiceSpeed}</span>
      </div>
      <Meta message={message} read={read} variant="inBubble" />
    </>
  );
}

interface BubbleProps {
  message: ReplicaMessage;
  read?: boolean;
  reaction?: string | null;
}

export function Bubble({ message, read = false, reaction = null }: BubbleProps) {
  const bare = message.kind === 'album';
  const inlineReaction = message.kind === 'text' ? reaction : null;

  return (
    <div className={cx(styles.bubble, message.own ? styles.out : styles.in, bare && styles.bubbleMedia)}>
      {message.kind === 'voice' && <Voice message={message} read={read} />}

      {bare && (
        <div className={styles.media}>
          <Album />
          <span className={styles.mediaMeta}>
            <Meta message={message} read={read} variant="overlay" />
          </span>
        </div>
      )}

      {message.kind === 'text' && (
        <span className={styles.textRow}>
          <span className={styles.text}>
            {message.text}
            {!inlineReaction && (
              <span
                className={styles.pad}
                style={{ width: `${message.own ? META_PAD.own : META_PAD.other}px` }}
              />
            )}
          </span>
          {!inlineReaction && <Meta message={message} read={read} />}
        </span>
      )}

      {inlineReaction && (
        <div className={styles.reactionMetaRow}>
          <Reactions emoji={inlineReaction} />
          <span className={styles.reactionMetaHolder}>
            <Meta message={message} read={read} variant="inline" />
          </span>
        </div>
      )}
    </div>
  );
}

export function Reactions({ emoji }: { emoji: string }) {
  return (
    <div className={styles.reactionRow}>
      <span className={cx(styles.reactionPill, styles.reactionMine, styles.reactionBump)}>
        <ReplicaEmoji emoji={emoji} size={REPLICA_EMOJI_SIZE.pill} />
        <span className={cx(styles.reactionCount, styles.reactionCountRoll)}>1</span>
      </span>
    </div>
  );
}

interface MessageRowProps {
  message: ReplicaMessage;
  read: boolean;
  reaction: string | null;
  held?: boolean;
  hidden?: boolean;
}

export function MessageRow({ message, read, reaction, held, hidden }: MessageRowProps) {
  const outsideReaction = message.kind === 'text' ? null : reaction;

  return (
    <div className={cx(styles.row, message.own && styles.rowOwn)}>
      <div
        className={cx(
          styles.bubbleCol,
          styles.arriving,
          message.kind === 'album' && styles.bubbleColMedia,
          held && styles.held,
          hidden && styles.hidden,
        )}
        data-demo-message={message.id}
      >
        <Bubble message={message} read={read} reaction={reaction} />
        {outsideReaction && <Reactions emoji={outsideReaction} />}
      </div>
    </div>
  );
}
