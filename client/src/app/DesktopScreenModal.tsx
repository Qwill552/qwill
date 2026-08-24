import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '../ui/Icon';
import styles from './DesktopScreenModal.module.css';

interface DesktopScreenModalProps {
  title: string;
  onClose: () => void;
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
export function DesktopScreenModal({ title, onClose, children }: DesktopScreenModalProps) {
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') startClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleScrimClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) startClose();
  }

  return createPortal(
    <div className={`${styles.scrim} ${closing ? styles.scrimClosing : ''}`} onClick={handleScrimClick}>
      <div
        className={`${styles.card} ${closing ? styles.cardClosing : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeButton} onClick={startClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
