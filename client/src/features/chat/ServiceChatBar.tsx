import { useChatStore } from '../../stores/chatStore';
import { GlassPill } from '../../ui/chrome/GlassPill';
import { Icon } from '../../ui/Icon';
import { Switch } from '../../ui/Switch';
import styles from './ServiceChatBar.module.css';

/** Место композера в чате Qwill: писать туда нельзя, поэтому вместо поля ввода — тумблер
 *  уведомлений, ровно то, к чему отсылает приписка в каждом объявлении. Капсула та же, что
 *  у остальной хромы (GlassPill), чтобы низ экрана не выпадал из оформления. */
export function ServiceChatBar({ chatId, muted }: { chatId: string; muted: boolean }) {
  const setChatMuted = useChatStore((s) => s.setChatMuted);

  return (
    <GlassPill
      className={styles.bar}
      leading={<Icon name={muted ? 'mute' : 'bell'} size={20} className={styles.icon} />}
      title="Уведомления"
      trailing={
        <Switch
          checked={!muted}
          onChange={(enabled) => {
            setChatMuted(chatId, !enabled).catch(() => undefined);
          }}
          label="Уведомления об обновлениях"
        />
      }
    />
  );
}
