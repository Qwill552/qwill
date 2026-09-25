import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { listReportGroupsRequest } from '../api/admin';
import { ChatList, type ChatListHandle } from '../features/chats/ChatList';
import { ChatFilters, type ChatFilter } from '../features/chats/ChatFilters';
import { ConnectionTitle } from '../features/chats/ConnectionTitle';
import { CreateGroupModal } from '../features/groups/CreateGroupModal';
import { SearchReveal, type RevealOrigin } from '../features/chats/SearchReveal';
import { BugReportDialog } from '../features/support/BugReportDialog';
import { DesktopUpdateButton } from '../features/updates/DesktopUpdate';
import { isEmptyPrivateChat, selectVisibleChats } from '../features/chats/visibleChats';
import { useAuthStore } from '../stores/authStore';
import { useChatListPrefsStore } from '../stores/chatListPrefsStore';
import { useChatSearchStore } from '../stores/chatSearchStore';
import { useChatStore } from '../stores/chatStore';
import { useUiStore } from '../stores/uiStore';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { FAB } from '../ui/FAB';
import { Icon } from '../ui/Icon';
import { Menu, type MenuItem } from '../ui/Menu';
import { Sheet } from '../ui/Sheet';
import { Switch } from '../ui/Switch';
import { onTabReactivate } from '../app/tabNav';
import { revealTransition } from '../app/viewTransition';
import { useHotkey } from '../app/hotkeys';
import { useLayoutMode } from '../app/useLayoutMode';
import styles from './ChatsScreen.module.css';

/** Радиус капсулы-триггера — совпадает с её собственным border-radius в CSS, но геометрию
 *  раскрытия SearchReveal получает числом, а не читает её из DOM. Место стыковки (см.
 *  openSearchReveal) всегда получает те же радиус и высоту, что и полная строка поиска —
 *  так переход от пилюли до стыковки становится чистым вертикальным сдвигом. */
const SEARCH_PILL_RADIUS = 22;
const SEARCH_BUTTON_RADIUS = 18;
const SEARCH_PILL_HEIGHT = 44;
/** На телефоне подпись объясняет, что поиск ищет и людей тоже, — там она первое, что видно
 *  на вкладке. В узкой десктопной колонке рядом с ☰ та же фраза выглядит многословной. */
const SEARCH_PLACEHOLDER_DESKTOP = 'Поиск';
/** Строка поиска стыкуется не вплотную к самому верху экрана, а с запасом — дополнительный
 *  отступ поверх собственного отступа шапки. */
const SEARCH_DOCK_TOP_GAP = 16;

/** Позиция скролла списка переживает уход в чат и возврат — компонент размонтируется,
 *  поэтому храним её вне React-состояния. */
let savedScrollTop = 0;

/** Буквально onListScroll из референса: полное поле поиска гаснет после 26px прокрутки,
 *  возвращается ниже 8px — зазор гасит дребезг на границе. */
const SEARCH_HIDE_AT = 26;
const SEARCH_SHOW_AT = 8;

/** Вкладка «Сообщения»: шапка (аватар/меню), поле поиска, чипсы фильтров — статичным блоком
 *  над отдельно скроллящимся списком (буквально из референса, не плавающая хрома). */
export function ChatsScreen() {
  const navigate = useNavigate();
  const loadChats = useChatStore((s) => s.loadChats);
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'admin';
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const layout = useLayoutMode();
  const listRef = useRef<ChatListHandle>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const headerRowRef = useRef<HTMLDivElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const themeSwitchRef = useRef<HTMLSpanElement>(null);
  const reactivateTaps = useRef(0);
  const tapResetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const folderTabsEnabled = useChatListPrefsStore((s) => s.folderTabsEnabled);

  const [filter, setFilter] = useState<ChatFilter>('all');
  const [composeOpen, setComposeOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [searchHidden, setSearchHidden] = useState(savedScrollTop > SEARCH_HIDE_AT);
  const [searchReveal, setSearchReveal] = useState<RevealOrigin | null>(null);
  const [searchDock, setSearchDock] = useState<RevealOrigin | null>(null);
  const [searchFromIcon, setSearchFromIcon] = useState(false);
  /** Шапка (аватар, вордмарк, кнопка меню) возвращается уже в момент, когда капсула-подделка
   *  начинает лететь обратно, а не после того, как она долетит и исчезнет (SearchReveal.tsx,
   *  onRetreatStart) — иначе её появление было рассинхронным рывком. Сама строка поиска сюда
   *  больше не завязана: она возвращается ровно в кадре размонтирования капсулы, потому что
   *  показывать обе разом нельзя (см. .searchWrapMuted в ChatsScreen.module.css). */
  const [searchRetreating, setSearchRetreating] = useState(false);

  const chatSearchOpen = useChatSearchStore((s) => s.open && s.chatId !== null);
  const closeChatSearch = useChatSearchStore((s) => s.close);
  const searchRevealRef = useRef<RevealOrigin | null>(null);
  searchRevealRef.current = searchReveal;

  const filterRowEnabled = folderTabsEnabled || isAdmin;
  const effectiveFilter = filterRowEnabled ? filter : 'all';

  const [openReportGroupCount, setOpenReportGroupCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    listReportGroupsRequest('open')
      .then((groups) => setOpenReportGroupCount(groups.length))
      .catch(() => undefined);
  }, [isAdmin]);

  const counts = useMemo(() => {
    const started = chats.filter((c) => !isEmptyPrivateChat(c));
    return {
      all: started.filter((c) => !isAdmin || !c.isSupportRequest).length,
      unread: started.filter((c) => c.unreadCount > 0).length,
      private: started.filter((c) => c.type === 'PRIVATE').length,
      groups: started.filter((c) => c.type === 'GROUP').length,
      support: started.filter((c) => c.isSupportRequest && c.unreadCount > 0).length,
      reports: openReportGroupCount,
    };
  }, [chats, isAdmin, openReportGroupCount]);

  function handleFilterChange(next: ChatFilter): void {
    if (next === 'reports') {
      navigate('/admin');
      return;
    }
    setFilter(next);
  }

  useHotkey(layout === 'desktop', { code: 'KeyK', mod: true, allowInInput: true }, () => openSearchByHotkey());
  useHotkey(layout === 'desktop', { key: 'ArrowDown', mod: true, allowInInput: true }, () => stepChat(1));
  useHotkey(layout === 'desktop', { key: 'ArrowUp', mod: true, allowInInput: true }, () => stepChat(-1));

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (layout !== 'desktop' || !chatSearchOpen || searchRevealRef.current) return;
    const trigger = searchTriggerRef.current;
    if (trigger) openSearchReveal(trigger, SEARCH_PILL_RADIUS, false);
  }, [layout, chatSearchOpen]);

  useEffect(() => {
    listRef.current?.restoreScrollTop(savedScrollTop);
  }, []);

  useEffect(
    () =>
      onTabReactivate('/chats', () => {
        clearTimeout(tapResetTimer.current);
        reactivateTaps.current += 1;
        if (reactivateTaps.current === 1) {
          listRef.current?.scrollToTop();
        } else {
          listRef.current?.scrollToFirstUnread();
          reactivateTaps.current = 0;
        }
        tapResetTimer.current = setTimeout(() => {
          reactivateTaps.current = 0;
        }, 2000);
      }),
    [],
  );

  function handleScroll(top: number): void {
    // Пока поиск открыт, список неинтерактивен, а пилюля/лупа под ним не должны дёргаться —
    // состояние возобновляется таким же, каким было, после закрытия (searchReveal null).
    if (searchReveal) return;
    savedScrollTop = top;
    if (top > SEARCH_HIDE_AT && !searchHidden) setSearchHidden(true);
    else if (top < SEARCH_SHOW_AT && searchHidden) setSearchHidden(false);
  }

  /** Поиск раскрывается из капсулы, по которой нажали, — строки поиска или кнопки-лупы
   *  в шапке, смотря что видно в момент нажатия (см. searchHidden). Координаты — относительно
   *  .screen. Место стыковки — прямоугольник .headerRow той же ширины/сдвига, что и у самой
   *  строки поиска (оба ряда делят один и тот же горизонтальный паддинг .top), но с высотой
   *  и радиусом полной строки — так переход от пилюли до стыковки становится чистым сдвигом. */
  function openSearchReveal(target: HTMLElement, radius: number, fromIcon: boolean): void {
    const rect = target.getBoundingClientRect();
    const screenRect = screenRef.current?.getBoundingClientRect();
    const headerRect = headerRowRef.current?.getBoundingClientRect();
    const originTop = screenRect?.top ?? 0;
    const originLeft = screenRect?.left ?? 0;

    setSearchReveal({
      top: rect.top - originTop,
      left: rect.left - originLeft,
      width: rect.width,
      height: rect.height,
      radius,
    });
    setSearchFromIcon(fromIcon);
    setSearchRetreating(false);
    if (!headerRect) return;

    if (layout === 'desktop') {
      const sideInset = headerRect.right - rect.right;
      setSearchDock({
        top: rect.top - originTop,
        left: headerRect.left - originLeft + sideInset,
        width: headerRect.width - sideInset * 2,
        height: rect.height,
        radius,
      });
      return;
    }

    setSearchDock({
      top: headerRect.top - originTop + SEARCH_DOCK_TOP_GAP,
      left: headerRect.left - originLeft,
      width: headerRect.width,
      height: SEARCH_PILL_HEIGHT,
      radius: SEARCH_PILL_RADIUS,
    });
  }

  /** Круговое раскрытие из пункта меню — растёт (на ночную) или стягивается (на дневную)
   *  в точку нажатия; при повторных нажатиях (меню теперь не закрывается, keepOpen) точка
   *  каждый раз та же. */
  function handleThemeToggle(event: MouseEvent<HTMLElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const toDark = theme === 'light';
    revealTransition(rect.left + rect.width / 2, rect.top + rect.height / 2, toDark, toggleTheme);
  }

  /** Клик по самому Switch не всплывает до строки меню (Menu.tsx оборачивает trailing
   *  в стоп-пропагейшен) — раскрытие темы считается от прямоугольника обёртки переключателя,
   *  а не строки целиком, ux-ui/14-desktop/04-main-menu.md допускает такое чтение «центра
   *  нажатой строки». */
  function handleThemeSwitchChange(): void {
    const rect = themeSwitchRef.current?.getBoundingClientRect();
    const toDark = theme === 'light';
    if (rect) revealTransition(rect.left + rect.width / 2, rect.top + rect.height / 2, toDark, toggleTheme);
    else toggleTheme();
  }

  const desktopMenuItems: MenuItem[] = [
    { id: 'profile', label: 'Мой профиль', icon: 'user', onSelect: () => navigate('/profile') },
    isAdmin
      ? { id: 'admin', label: 'Админ-панель', icon: 'shield', onSelect: () => navigate('/admin') }
      : { id: 'contacts', label: 'Контакты', icon: 'users', onSelect: () => navigate('/contacts') },
    { id: 'settings', label: 'Настройки', icon: 'settings', onSelect: () => navigate('/settings') },
    ...(isAdmin
      ? []
      : [
          {
            id: 'bugReport',
            label: 'Что улучшить?',
            icon: 'help' as const,
            dividerBefore: true,
            onSelect: () => setBugReportOpen(true),
          },
        ]),
    {
      id: 'theme',
      label: 'Тёмная тема',
      icon: 'moon',
      keepOpen: true,
      dividerBefore: isAdmin,
      onSelect: handleThemeToggle,
      trailing: (
        <span ref={themeSwitchRef}>
          <Switch checked={theme === 'dark'} onChange={handleThemeSwitchChange} label="Тёмная тема" />
        </span>
      ),
    },
  ];

  const navigableChats = useMemo(
    () => selectVisibleChats(chats, effectiveFilter, isAdmin),
    [chats, effectiveFilter, isAdmin],
  );

  function stepChat(delta: number): void {
    if (navigableChats.length === 0) return;
    const current = navigableChats.findIndex((chat) => chat.id === activeChatId);
    const target =
      current < 0
        ? navigableChats[delta > 0 ? 0 : navigableChats.length - 1]
        : navigableChats[Math.min(navigableChats.length - 1, Math.max(0, current + delta))];
    if (!target || target.id === activeChatId) return;
    navigate(`/chats/${target.id}`);
    listRef.current?.revealChat(target.id);
  }

  function openSearchByHotkey(): void {
    const trigger = searchTriggerRef.current;
    if (!trigger || searchReveal) return;
    openSearchReveal(trigger, SEARCH_PILL_RADIUS, false);
  }

  function openChat(chatId: string): void {
    setComposeOpen(false);
    setGroupOpen(false);
    navigate(`/chats/${chatId}`);
  }

  return (
    <div className={styles.screen} ref={screenRef}>
      <div className={styles.top}>
        {layout === 'desktop' ? (
          <div
            className={`${styles.desktopHeaderRow} ${searchReveal && !searchRetreating ? styles.headerRowHidden : ''}`}
            ref={headerRowRef}
          >
            <button
              type="button"
              className={styles.menuBtn}
              aria-label="Меню"
              onClick={(e) => setMenuAnchor(e.currentTarget.getBoundingClientRect())}
            >
              <Icon name="menu" size={18} />
            </button>
            <button
              type="button"
              ref={searchTriggerRef}
              className={`${styles.searchTrigger} ${searchReveal ? styles.searchTriggerCovered : ''}`}
              onClick={(e) => openSearchReveal(e.currentTarget, SEARCH_PILL_RADIUS, false)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>{SEARCH_PLACEHOLDER_DESKTOP}</span>
            </button>
          </div>
        ) : (
          <>
            <div
              className={`${styles.headerRow} ${searchReveal && !searchRetreating ? styles.headerRowHidden : ''}`}
              ref={headerRowRef}
            >
              <div className={styles.brand}>
                <Avatar label={me?.displayName ?? 'Q'} avatarUrl={me?.avatarUrl} size={38} color={me?.avatarColor} />
                <ConnectionTitle />
              </div>
              <div className={styles.actions}>
                <span className={`${styles.searchToggleSlot} ${searchHidden ? styles.searchToggleVisible : ''}`}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="Поиск"
                    tabIndex={searchHidden ? 0 : -1}
                    onClick={(e) => openSearchReveal(e.currentTarget, SEARCH_BUTTON_RADIUS, true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Меню"
                  onClick={(e) => setMenuAnchor(e.currentTarget.getBoundingClientRect())}
                >
                  <svg width="4" height="16" viewBox="0 0 4 16" aria-hidden="true">
                    <circle cx="2" cy="2" r="1.8" fill="currentColor" />
                    <circle cx="2" cy="8" r="1.8" fill="currentColor" />
                    <circle cx="2" cy="14" r="1.8" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              className={`${styles.searchWrap} ${searchHidden ? styles.searchWrapHidden : ''} ${searchReveal ? styles.searchWrapMuted : ''}`}
            >
              <button
                type="button"
                className={styles.searchTrigger}
                tabIndex={searchHidden ? -1 : 0}
                onClick={(e) => openSearchReveal(e.currentTarget, SEARCH_PILL_RADIUS, false)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span>Поиск чатов и людей</span>
              </button>
            </div>
          </>
        )}

        {filterRowEnabled && (
          <ChatFilters value={filter} onChange={handleFilterChange} counts={counts} admin={isAdmin} />
        )}
      </div>

      <ChatList ref={listRef} filter={effectiveFilter} onScroll={handleScroll} />

      <DesktopUpdateButton />

      {searchReveal && searchDock && (
        <SearchReveal
          origin={searchReveal}
          dock={searchDock}
          fromIcon={searchFromIcon}
          placeholder={layout === 'desktop' ? SEARCH_PLACEHOLDER_DESKTOP : 'Поиск чатов и людей'}
          onRetreatStart={() => setSearchRetreating(true)}
          onClose={() => {
            setSearchReveal(null);
            setSearchDock(null);
            closeChatSearch();
          }}
          onOpenChat={openChat}
        />
      )}

      {menuAnchor && layout === 'desktop' && (
        <Menu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          desktopWidth={272}
          header={{
            avatarUrl: me?.avatarUrl,
            avatarColor: me?.avatarColor,
            label: me?.displayName ?? '',
            username: me?.username,
            onSelect: () => navigate('/profile'),
          }}
          items={desktopMenuItems}
        />
      )}

      {menuAnchor && layout === 'mobile' && (
        <Menu
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          items={[
            {
              id: 'theme',
              label: theme === 'dark' ? 'Дневная тема' : 'Ночная тема',
              icon: theme === 'dark' ? 'sun' : 'moon',
              keepOpen: true,
              onSelect: handleThemeToggle,
            },
          ]}
        />
      )}

      <FAB icon="plus" label="Написать" onClick={() => setComposeOpen(true)} />

      {composeOpen && (
        <Sheet title="Новое сообщение" onClose={() => setComposeOpen(false)}>
          <div className={styles.sheetBody}>
            <Card>
              <Card.Row
                icon="users"
                tint="blue"
                title="Новая группа"
                subtitle="Соберите чат из нескольких человек"
                onClick={() => {
                  setComposeOpen(false);
                  setGroupOpen(true);
                }}
              />
            </Card>
          </div>
        </Sheet>
      )}

      {groupOpen && <CreateGroupModal onClose={() => setGroupOpen(false)} onCreated={openChat} />}

      {bugReportOpen && <BugReportDialog onClose={() => setBugReportOpen(false)} />}
    </div>
  );
}
