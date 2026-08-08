import { create } from 'zustand';

const STORAGE_KEY = 'messenger.chatFolderTabs';

/** Только клиентская настройка — на сервере под неё нет поля в UserSettingsDTO, и заводить
 *  его ради одного чекбокса вкладок списка чатов не соразмерно (редизайн 2026-08-01). */
function readStored(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  // По умолчанию включено — референс «Пульс» показывает ряд вкладок (Все/Каналы/Личные/Группы)
  // сразу, без захода в настройки (правка 2026-08-02, отменяет дефолт «выключено» от 2026-08-01).
  return stored === null ? true : stored === '1';
}

interface ChatListPrefsState {
  /** Показывать ли ряд встроенных вкладок (Все/Каналы/Личные/Группы) над списком чатов. */
  folderTabsEnabled: boolean;
  setFolderTabsEnabled: (enabled: boolean) => void;
}

export const useChatListPrefsStore = create<ChatListPrefsState>((set) => ({
  folderTabsEnabled: readStored(),
  setFolderTabsEnabled(enabled) {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    set({ folderTabsEnabled: enabled });
  },
}));
