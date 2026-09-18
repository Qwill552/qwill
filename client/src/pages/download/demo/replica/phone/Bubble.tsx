import { Icon } from '../../../../../ui/Icon';
import { cx } from './Chrome';
import { ALBUM_PHOTOS, REPLICA_TEXT, VOICE_PEAKS, type ReplicaMessage } from './demoData';
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

type MetaVariant = 'anchored' | 'overlay' | 'inBubble';

function Meta({ message, variant = 'anchored' }: { message: ReplicaMessage; variant?: MetaVariant }) {
  return (
    <span
      className={cx(
        styles.meta,
        variant === 'overlay' && styles.metaOverlay,
        variant === 'anchored' && styles.metaAnchored,
        variant === 'inBubble' && styles.metaInBubble,
        message.own && styles.metaOnOut,
      )}
    >
      {message.time}
      {message.own && (
        <Icon name={message.read ? 'check-double' : 'check'} size={15} className={styles.check} />
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

function Voice({ message }: { message: ReplicaMessage }) {
  return (
    <>
      <div className={styles.voiceHead}>
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
      <div className={styles.voiceFoot} style={{ paddingRight: `${META_PAD.other}px` }}>
        <span className={styles.voiceDuration}>{message.voiceDuration}</span>
        <span className={styles.voiceDot} />
        <span className={styles.voiceSpeed}>{REPLICA_TEXT.voiceSpeed}</span>
      </div>
      <Meta message={message} variant="inBubble" />
    </>
  );
}

export function Bubble({ message }: { message: ReplicaMessage }) {
  const bare = message.kind === 'album';

  return (
    <div className={cx(styles.bubble, message.own ? styles.out : styles.in, bare && styles.bubbleMedia)}>
      {message.kind === 'voice' && <Voice message={message} />}

      {bare && (
        <div className={styles.media}>
          <Album />
          <span className={styles.mediaMeta}>
            <Meta message={message} variant="overlay" />
          </span>
        </div>
      )}

      {message.kind === 'text' && (
        <span className={styles.textRow}>
          <span className={styles.text}>
            {message.text}
            <span
              className={styles.pad}
              style={{ width: `${message.own ? META_PAD.own : META_PAD.other}px` }}
            />
          </span>
          <Meta message={message} />
        </span>
      )}
    </div>
  );
}

export function Reactions({ emoji }: { emoji: string }) {
  return (
    <div className={styles.reactionRow}>
      <span className={styles.reactionPill}>
        <span className={styles.reactionEmoji}>{emoji}</span>
        <span className={styles.reactionCount}>1</span>
      </span>
    </div>
  );
}

interface MessageRowProps {
  message: ReplicaMessage;
  hidden?: boolean;
}

export function MessageRow({ message, hidden }: MessageRowProps) {
  return (
    <div className={cx(styles.row, message.own && styles.rowOwn)}>
      <div className={cx(styles.bubbleCol, message.kind === 'album' && styles.bubbleColMedia, hidden && styles.hidden)}>
        <Bubble message={message} />
        {message.reaction && <Reactions emoji={message.reaction} />}
      </div>
    </div>
  );
}
