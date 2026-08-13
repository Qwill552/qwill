import { useEffect } from 'react';

import { useBackHandler } from '../../app/useBackHandler';
import { startRingtone, stopRingtone } from '../../calls/ringtone';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useChatStore } from '../../stores/chatStore';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { Ripple } from '../../ui/Ripple';
import styles from './IncomingCall.module.css';

export function IncomingCall() {
  const call = useCallStore((s) => s.call);
  const acceptCall = useCallStore((s) => s.acceptCall);
  const declineCall = useCallStore((s) => s.declineCall);
  const myId = useAuthStore((s) => s.user?.id) ?? null;
  const activeChatId = useChatStore((s) => s.activeChatId);

  useEffect(() => {
    startRingtone();
    return () => stopRingtone();
  }, []);

  const isInThatChat = call !== null && activeChatId === call.chatId;
  useBackHandler(!isInThatChat, () => void declineCall());

  const caller = call?.participants.find((p) => p.user.id !== myId)?.user ?? null;
  const displayName = caller?.displayName ?? '…';

  const handleAccept = () => void acceptCall();
  const handleDecline = () => void declineCall();

  if (isInThatChat) {
    return (
      <div className={styles.inline} role="alert">
        <Avatar label={displayName} avatarUrl={caller?.avatarUrl} size={36} color={caller?.avatarColor} colorKey={caller?.id} />
        <span className={styles.inlineName}>{displayName}</span>
        <div className={styles.inlineActions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSmall} ${styles.decline}`}
            aria-label="Отклонить звонок"
            title="Отклонить звонок"
            onClick={handleDecline}
          >
            <Icon name="phone" size={18} className={styles.declineGlyph} />
            <Ripple />
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSmall} ${styles.accept}`}
            aria-label="Принять звонок"
            title="Принять звонок"
            onClick={handleAccept}
          >
            <Icon name="phone" size={18} />
            <Ripple />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scrim}>
      <div className={styles.card} role="alert">
        <Avatar label={displayName} avatarUrl={caller?.avatarUrl} size={96} color={caller?.avatarColor} colorKey={caller?.id} />
        <h1 className={styles.name}>{displayName}</h1>
        <p className={styles.status}>Входящий звонок…</p>
        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.decline}`} aria-label="Отклонить звонок" title="Отклонить звонок" onClick={handleDecline}>
            <Icon name="phone" size={28} className={styles.declineGlyph} />
            <Ripple />
          </button>
          <button type="button" className={`${styles.button} ${styles.accept}`} aria-label="Принять звонок" title="Принять звонок" onClick={handleAccept}>
            <Icon name="phone" size={28} />
            <Ripple />
          </button>
        </div>
      </div>
    </div>
  );
}
