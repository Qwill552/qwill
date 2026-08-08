import { useNavigate } from 'react-router-dom';

import { EmptyState } from '../features/chats/EmptyState';
import { AmbientBlobs } from '../app/AmbientBlobs';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import styles from './StubScreen.module.css';

interface StubScreenProps {
  title: string;
  subtitle?: string;
  /** Путь для кнопки «назад» — только у вложенных экранов; у корня вкладки её нет. */
  backTo?: string;
}

/** Заглушка для маршрутов будущих этапов — сам маршрут должен существовать уже сейчас,
 *  иначе следующий этап переписывает роутинг вместо того, чтобы наполнять экран (ux-ui/02-shell.md). */
export function StubScreen({ title, subtitle, backTo }: StubScreenProps) {
  const navigate = useNavigate();

  return (
    <div className={styles.screen}>
      <AmbientBlobs />
      <div className={styles.body}>
        <EmptyState title="Скоро" subtitle={subtitle ?? 'Этот раздел появится на одном из следующих этапов'} />
      </div>
      <ChromeBar>
        {backTo && <GlassButton icon="back" label="Назад" onClick={() => navigate(backTo)} />}
        <GlassPill title={title} />
      </ChromeBar>
    </div>
  );
}
