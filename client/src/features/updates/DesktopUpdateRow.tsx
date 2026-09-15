import { useDesktopUpdateStore } from '../../app/desktopUpdate';
import { Card } from '../../ui/Card';

export function useDesktopUpdateStatus(): string | null {
  const state = useDesktopUpdateStore((s) => s.state);

  switch (state.phase) {
    case 'checking':
      return 'проверяю обновление';
    case 'downloading':
      return `загружается ${state.version} · ${Math.round(state.percent * 100)}%`;
    case 'ready':
      return `обновление до ${state.version} готово`;
    default:
      return null;
  }
}

export function DesktopUpdateRow({ className }: { className?: string }) {
  const state = useDesktopUpdateStore((s) => s.state);
  const install = useDesktopUpdateStore((s) => s.install);

  if (state.phase !== 'ready') return null;

  return (
    <Card className={className}>
      <Card.Row
        icon="retry"
        tint="green"
        title="Перезапустить и обновиться"
        subtitle={`Версия ${state.version} загружена`}
        onClick={install}
        chevron={false}
      />
    </Card>
  );
}
