import { useDesktopUpdateStore } from '../../app/desktopUpdate';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import styles from './DesktopUpdate.module.css';

export function useDesktopUpdateStatus(): string | null {
  const state = useDesktopUpdateStore((s) => s.state);

  switch (state.phase) {
    case 'checking':
      return 'проверяю обновление';
    case 'downloading':
      return `загружается ${state.version} · ${Math.round(state.percent * 100)}%`;
    case 'ready':
      return `обновление до ${state.version} готово`;
    case 'error':
      return 'обновление не проверилось';
    default:
      return null;
  }
}

export function DesktopUpdateButton() {
  const ready = useDesktopUpdateStore((s) => s.state.phase === 'ready');
  const install = useDesktopUpdateStore((s) => s.install);

  if (!ready) return null;

  return (
    <button type="button" className={styles.button} onClick={install}>
      <Icon name="retry" size={18} />
      Обновить Qwill
    </button>
  );
}

export function DesktopUpdateRow({ className }: { className?: string }) {
  const state = useDesktopUpdateStore((s) => s.state);
  const install = useDesktopUpdateStore((s) => s.install);

  if (state.phase !== 'ready') return null;

  return (
    <Card className={className}>
      <Card.Row title="Обновить Qwill" accent onClick={install} chevron={false} />
    </Card>
  );
}
