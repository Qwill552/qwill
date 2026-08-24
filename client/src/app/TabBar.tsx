import type { MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useChatStore } from '../stores/chatStore';
import { Badge } from '../ui/Badge';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { emitTabReactivate, lastPathForTab } from './tabNav';
import styles from './TabBar.module.css';
import { isTabRoot, tabOf } from './routing';
import { useLayoutMode } from './useLayoutMode';

/** Пути `d` — буквально ICON.chat/person/sliders/profile из референса (viewBox 0 0 20 20,
 *  stroke-width 1.6), не общий набор иконок приложения: там другая сетка (24, вес 2). */
const TAB_ICON_PATH: Record<string, string> = {
  chats: 'M4 4.5h12a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H9l-4 3v-3H4A1.5 1.5 0 012.5 12V6A1.5 1.5 0 014 4.5z',
  contacts: 'M10 3.6a3 3 0 110 6 3 3 0 010-6zM4.4 16.4c.5-3 2.7-4.6 5.6-4.6s5.1 1.6 5.6 4.6',
  settings:
    'M3 6.5h1.5M7.5 6.5h9.5M3 13.5h6.5M12.5 13.5h4.5M6 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11 12a1.5 1.5 0 110 3 1.5 1.5 0 010-3z',
  profile:
    'M10 3.4a6.6 6.6 0 110 13.2 6.6 6.6 0 010-13.2zM10 7.6a2.2 2.2 0 110 4.4 2.2 2.2 0 010-4.4zM5.7 15.3c.8-1.7 2.3-2.6 4.3-2.6s3.5.9 4.3 2.6',
};

const TABS: { root: string; icon: keyof typeof TAB_ICON_PATH; label: string }[] = [
  { root: '/chats', icon: 'chats', label: 'Сообщения' },
  { root: '/contacts', icon: 'contacts', label: 'Контакты' },
  { root: '/settings', icon: 'settings', label: 'Настройки' },
  { root: '/profile', icon: 'profile', label: 'Профиль' },
];

/** Позиция капсулы — буквально left/right/bottom:26px из референса, плюс safe-area поверх
 *  (у демо-инструмента с рамкой телефона её не было и не могло быть). Задаётся инлайн-стилем
 *  через ChromeBar.style — сильнее классов `.top`/`.bottom` из ChromeBar.module.css, которые
 *  здесь не участвуют (капсула сама несёт весь фон/блюр/бордер, полоса-обёртка — просто рамка
 *  под нужным отступом), и не трогает другие экраны, использующие тот же ChromeBar. */
const CAPSULE_POSITION = {
  left: 'calc(26px + var(--safe-left))',
  right: 'calc(26px + var(--safe-right))',
  bottom: 'calc(26px + var(--safe-bottom))',
  padding: 0,
};

/** Нижний таб-бар: Сообщения · Контакты · Настройки · Профиль. Скрывается на вложенных экранах —
 *  чат, инфо, раздел настроек — и появляется обратно (ux-ui/02-shell.md). На десктопе не
 *  показывается вовсе — навигация уехала в ☰-меню шапки списка (ux-ui/14-desktop/04-main-menu.md). */
export function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const unreadTotal = useChatStore((s) => s.chats.reduce((sum, c) => sum + c.unreadCount, 0));

  const layout = useLayoutMode();

  const activeTab = tabOf(location.pathname);
  const hidden = layout === 'desktop' || !isTabRoot(location.pathname);

  function handleClick(event: MouseEvent<HTMLButtonElement>, root: string): void {
    event.currentTarget.blur();
    if (location.pathname === root) {
      emitTabReactivate(root);
      return;
    }
    navigate(lastPathForTab(root));
  }

  return (
    <ChromeBar side="bottom" className={`${styles.wrap} ${hidden ? styles.hidden : ''}`} style={CAPSULE_POSITION}>
      <nav className={styles.capsule} aria-hidden={hidden}>
        {TABS.map((tab) => {
          const active = tabOf(tab.root) === activeTab;
          return (
            <button
              key={tab.root}
              type="button"
              className={`${styles.tab} ${active ? styles.tabActive : ''}`}
              aria-current={active ? 'page' : undefined}
              tabIndex={hidden ? -1 : 0}
              onClick={(e) => handleClick(e, tab.root)}
            >
              <span className={styles.iconWrap}>
                <svg
                  className={`${styles.icon} ${active ? styles.iconActive : ''}`}
                  width="25"
                  height="25"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d={TAB_ICON_PATH[tab.icon]}
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {tab.root === '/chats' && <Badge count={unreadTotal} small className={styles.badge} />}
              </span>
              <span className={styles.label}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </ChromeBar>
  );
}
