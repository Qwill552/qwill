import { Icon } from '../../ui/Icon';
import styles from './MessageMeta.module.css';

interface MessageMetaProps {
  createdAt: string;
  own: boolean;
  edited: boolean;
  status: 'sending' | 'sent' | 'failed';
  /** Прочитано всеми, кроме автора, — двойная галочка вместо одинарной. */
  read: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Метаданные внутри пузыря — буквально строка 333 референса: абсолютом в правом нижнем
 *  углу пузыря. Текст резервирует под них место невидимой распоркой (см. .pad в
 *  MessageBubble), а не float/обтеканием. */
export function MessageMeta({ createdAt, own, edited, status, read }: MessageMetaProps) {
  const classes = [
    styles.meta,
    own ? styles.onOut : '',
    status === 'sending' ? styles.pending : '',
    status === 'failed' ? styles.failed : '',
  ].join(' ');

  return (
    <span className={classes}>
      {edited && <span className={styles.edited}>изм.</span>}
      {status === 'failed' ? 'не отправлено' : formatTime(createdAt)}
      {own && status === 'sending' && <Icon name="clock" size={13} className={styles.check} />}
      {own && status === 'sent' && (
        <Icon name={read ? 'check-double' : 'check'} size={13} className={styles.check} />
      )}
    </span>
  );
}
