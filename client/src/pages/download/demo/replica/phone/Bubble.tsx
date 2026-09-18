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
      <Meta message={message} read={read} variant="inBubble" />
    </>
  );
}

export function Bubble({ message, read = false }: { message: ReplicaMessage; read?: boolean }) {
  const bare = message.kind === 'album';

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
            <span
              className={styles.pad}
              style={{ width: `${message.own ? META_PAD.own : META_PAD.other}px` }}
            />
          </span>
          <Meta message={message} read={read} />
        </span>
      )}
    </div>
  );
}

export function Reactions({ emoji }: { emoji: string }) {
  return (
    <div className={styles.reactionRow}>
      <span className={cx(styles.reactionPill, styles.reactionLanding)}>
        <span className={styles.reactionEmoji}>{emoji}</span>
        <span className={styles.reactionCount}>1</span>
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
        <Bubble message={message} read={read} />
        {reaction && <Reactions emoji={reaction} />}
      </div>
    </div>
  );
}
