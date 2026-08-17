import type { MessageCallDto } from '@messenger/shared';

import { callDurationText, callStatusLabel, callSymbolIcon, isUnansweredCall } from '../calls/callLog';
import { Icon } from '../../ui/Icon';
import styles from './CallMessage.module.css';

interface CallMessageProps {
  call: MessageCallDto;
  own: boolean;
  createdAt: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function CallMessage({ call, own, createdAt }: CallMessageProps) {
  const duration = callDurationText(call);
  const failed = isUnansweredCall(call) || call.status === 'DECLINED';

  return (
    <span className={`${styles.record} ${own ? styles.own : ''}`}>
      <span className={styles.body}>
        <span className={styles.label}>{callStatusLabel(call, own)}</span>
        <span className={styles.details}>
          <Icon
            name={callSymbolIcon(call, own)}
            size={15}
            className={`${styles.symbol} ${failed ? styles.symbolFailed : ''}`}
          />
          <span className={styles.time}>{formatTime(createdAt)}</span>
          {duration && <span className={styles.duration}>· {duration}</span>}
        </span>
      </span>
      <Icon name="phone" size={22} className={styles.phone} />
    </span>
  );
}
