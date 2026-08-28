import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useEscapeKey } from './hotkeys';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import styles from './DesktopScreenModal.module.css';

interface DesktopScreenModalProps {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  chromeless?: boolean;
  wide?: boolean;
  headerAction?: ReactNode;
  children: ReactNode;
}

/**
 * Контакты/Настройки/Профиль на десктопе — не отдельная колонка, а всплывающая карточка
 * по центру поверх обеих колонок, как в Telegram Desktop (решение пользователя, не в макете
 * D-3 — тот вопрос был в разделе «Осталось решить» ux-ui/14-desktop/04-main-menu.md). Список
 * чатов слева остаётся на месте и виден под лёгким затемнением.
 *
 * Закрытие анимированное — та же схема отложенного unmount, что у Sheet.tsx/Menu.tsx.
 * Реальный маршрут (`/contacts`, `/settings`, `/profile`, их подстраницы) не подменяется
 * синтетической историей оверлея: это настоящая навигация react-router, поэтому аппаратная
 * кнопка «назад» и так закрывает карточку — просто без exit-анимации, потому что ScreenStack
 * перестаёт её рендерить в тот же кадр, где меняется location.
 */
export function DesktopScreenModal({
  title,
  onClose,
  onBack,
  chromeless,
  wide,
  headerAction,
  children,
}: DesktopScreenModalProps) {
  const [closing, setClosing] = useState(false);

  function startClose(): void {
    setClosing((current) => current || true);
  }

  useEffect(() => {
    if (!closing) return;
    const ms = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-close')) || 0;
    const timer = window.setTimeout(onClose, ms);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  useEscapeKey(!closing, startClose);

  function handleScrimClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) startClose();
  }

  return createPortal(
    <div className={`${styles.scrim} ${closing ? styles.scrimClosing : ''}`} onClick={handleScrimClick}>
      <div
        className={`${styles.card} ${wide ? styles.cardWide : ''} ${chromeless ? styles.cardChromeless : ''} ${closing ? styles.cardClosing : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {chromeless ? (
          <button
            type="button"
            className={`${styles.closeButton} ${styles.closeFloating}`}
            onClick={startClose}
            aria-label="Закрыть"
          >
            <Icon name="close" size={18} />
          </button>
        ) : (
          <div className={styles.header}>
            <div className={styles.titleRow}>
              {onBack && <IconButton icon="back" label="Назад" onClick={onBack} />}
              <h2 className={styles.title}>{title}</h2>
            </div>
            <div className={styles.headerActions}>
              {headerAction}
              <IconButton icon="close" label="Закрыть" onClick={startClose} />
            </div>
          </div>
        )}
        <div className={styles.body}>
          <div key={title} className={styles.content}>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
