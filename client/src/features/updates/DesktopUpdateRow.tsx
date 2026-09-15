import { useDesktopUpdateStore } from '../../app/desktopUpdate';
import { Card } from '../../ui/Card';

interface RowContent {
  title: string;
  subtitle: string;
  onClick: (() => void) | undefined;
}

export function DesktopUpdateRow({ className }: { className?: string }) {
  const state = useDesktopUpdateStore((s) => s.state);
  const check = useDesktopUpdateStore((s) => s.check);
  const install = useDesktopUpdateStore((s) => s.install);

  if (state.phase === 'disabled') return null;

  const content = ((): RowContent => {
    switch (state.phase) {
      case 'checking':
        return { title: 'Обновления', subtitle: 'Проверяю…', onClick: undefined };
      case 'latest':
        return { title: 'Обновления', subtitle: 'Установлена последняя версия', onClick: check };
      case 'downloading':
        return {
          title: 'Загружается обновление',
          subtitle: `Версия ${state.version} · ${Math.round(state.percent * 100)}%`,
          onClick: undefined,
        };
      case 'ready':
        return {
          title: 'Обновление готово',
          subtitle: `Версия ${state.version} · нажмите, чтобы перезапустить`,
          onClick: install,
        };
      case 'error':
        return { title: 'Обновления', subtitle: state.message, onClick: check };
      default:
        return { title: 'Обновления', subtitle: 'Проверить наличие новой версии', onClick: check };
    }
  })();

  return (
    <Card className={className}>
      <Card.Row
        icon="retry"
        tint="green"
        title={content.title}
        subtitle={content.subtitle}
        onClick={content.onClick}
        chevron={false}
      />
    </Card>
  );
}
