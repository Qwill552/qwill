import { useEffect, useRef } from 'react';

import { Icon } from '../../ui/Icon';
import { formatHourMinute } from '../../utils/dateFormats';
import styles from './MessageMeta.module.css';

interface MessageMetaProps {
  createdAt: string;
  own: boolean;
  edited: boolean;
  status: 'sending' | 'sent' | 'failed';
  /** Прочитано всеми, кроме автора, — двойная галочка вместо одинарной. */
  read: boolean;
  variant?: MetaVariant;
}

type MetaVariant = 'anchored' | 'overlay' | 'inline';

const GAP_BEFORE_META = 12;
const CHECK_SIZE = 15;

function formatTime(iso: string): string {
  return formatHourMinute(new Date(iso));
}

/** Метаданные внутри пузыря — буквально строка 333 референса: абсолютом в правом нижнем
 *  углу пузыря. Текст резервирует под них место невидимой распоркой (см. .pad в
 *  MessageBubble), а не float/обтеканием. */
export function MessageMeta({ createdAt, own, edited, status, read, variant = 'anchored' }: MessageMetaProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (variant !== 'anchored') return;
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const observer = new ResizeObserver(() => {
      parent.style.setProperty('--meta-w', `${el.offsetWidth + GAP_BEFORE_META}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [variant]);

  const classes = [
    styles[variant === 'anchored' ? 'meta' : variant],
    own && variant === 'anchored' ? styles.onOut : '',
    status === 'sending' ? styles.pending : '',
    status === 'failed' ? styles.failed : '',
  ].join(' ');

  return (
    <span className={classes} ref={ref}>
      {edited && <span className={styles.edited}>изм.</span>}
      {status === 'failed' ? 'не отправлено' : formatTime(createdAt)}
      {own && status === 'sending' && <Icon name="clock" size={CHECK_SIZE} className={styles.check} />}
      {own && status === 'sent' && (
        <Icon name={read ? 'check-double' : 'check'} size={CHECK_SIZE} className={styles.check} />
      )}
    </span>
  );
}
