export type ReplicaScreen = 'chats' | 'chat';

export type ReplicaOverlay = 'none' | 'menu' | 'attach';

export interface ReplicaState {
  screen: ReplicaScreen;
  composerText: string;
  composerFocused: boolean;
  overlay: ReplicaOverlay;
  recording: boolean;
  menuMessageId: string | null;
  menuPick: string | null;
  reactionMessageId: string | null;
  pressed: string | null;
  visibleMessages: number;
  readUpTo: number;
}

export const PRESS = {
  row: 'row-artem',
  bubble: 'm5',
  composer: 'composer',
  send: 'send',
  mic: 'mic',
  back: 'back',
} as const;

export interface ScreenSurface {
  viewport: (node: HTMLElement | null) => void;
  inner: (node: HTMLElement | null) => void;
}

export interface ReplicaPerson {
  id: string;
  name: string;
  username: string;
}

export const PEOPLE = {
  artem: { id: 'artem', name: 'Артём Лисицын', username: '@artem' },
  nina: { id: 'nina', name: 'Нина Ковалёва', username: '@nina' },
  mark: { id: 'mark', name: 'Марк Ерохин', username: '@mark' },
  me: { id: 'me', name: 'Вы', username: '@you' },
} as const satisfies Record<string, ReplicaPerson>;

export interface ReplicaChatRow {
  id: string;
  title: string;
  preview: string;
  authorPrefix: string;
  time: string;
  unread: number;
  online: boolean;
  muted: boolean;
  official: boolean;
  icon: 'mic' | 'camera' | null;
  sent: boolean;
}

export const CHAT_ROWS: ReplicaChatRow[] = [
  {
    id: 'artem',
    title: PEOPLE.artem.name,
    preview: 'Тихо, без мучений',
    authorPrefix: '',
    time: '09:17',
    unread: 2,
    online: true,
    muted: false,
    official: false,
    icon: null,
    sent: false,
  },
  {
    id: 'nina',
    title: PEOPLE.nina.name,
    preview: 'Заберу ключи после шести',
    authorPrefix: '',
    time: 'Вчера',
    unread: 0,
    online: true,
    muted: false,
    official: false,
    icon: null,
    sent: false,
  },
  {
    id: 'dacha',
    title: 'Дача на выходных',
    preview: 'Мангал беру на себя',
    authorPrefix: 'Марк: ',
    time: 'Вчера',
    unread: 5,
    online: false,
    muted: false,
    official: false,
    icon: null,
    sent: false,
  },
  {
    id: 'qwill',
    title: 'Qwill',
    preview: 'Вышло обновление',
    authorPrefix: '',
    time: 'Вчера',
    unread: 1,
    online: false,
    muted: false,
    official: true,
    icon: null,
    sent: false,
  },
  {
    id: 'mark',
    title: PEOPLE.mark.name,
    preview: 'Договорились',
    authorPrefix: 'Вы: ',
    time: 'Пн',
    unread: 0,
    online: false,
    muted: false,
    official: false,
    icon: null,
    sent: true,
  },
  {
    id: 'katya',
    title: 'Катя Ремизова',
    preview: 'Спасибо, что заехал',
    authorPrefix: '',
    time: 'Пн',
    unread: 0,
    online: false,
    muted: false,
    official: false,
    icon: null,
    sent: false,
  },
  {
    id: 'books',
    title: 'Книжный клуб',
    preview: 'Встречаемся в четверг',
    authorPrefix: 'Оля: ',
    time: 'Вс',
    unread: 0,
    online: false,
    muted: true,
    official: false,
    icon: null,
    sent: false,
  },
  {
    id: 'pavel',
    title: 'Павел Гущин',
    preview: 'Голосовое сообщение',
    authorPrefix: '',
    time: 'Сб',
    unread: 0,
    online: false,
    muted: false,
    official: false,
    icon: 'mic',
    sent: false,
  },
  {
    id: 'neighbours',
    title: 'Соседи, третий подъезд',
    preview: 'Фото',
    authorPrefix: 'Вы: ',
    time: 'Сб',
    unread: 0,
    online: false,
    muted: true,
    official: false,
    icon: 'camera',
    sent: true,
  },
  {
    id: 'garage',
    title: 'Гаражи',
    preview: 'Кто последний брал домкрат',
    authorPrefix: 'Серёга: ',
    time: 'Сб',
    unread: 0,
    online: false,
    muted: false,
    official: false,
    icon: null,
    sent: false,
  },
  {
    id: 'lena',
    title: 'Лена Астахова',
    preview: 'Поздравляю!',
    authorPrefix: '',
    time: 'Пт',
    unread: 0,
    online: false,
    muted: false,
    official: false,
    icon: null,
    sent: false,
  },
  {
    id: 'work',
    title: 'Смена, вторая бригада',
    preview: 'Голосовое сообщение',
    authorPrefix: 'Игорь: ',
    time: 'Пт',
    unread: 0,
    online: false,
    muted: true,
    official: false,
    icon: 'mic',
    sent: false,
  },
  {
    id: 'oleg',
    title: 'Олег Сенцов',
    preview: 'Скинь адрес, подъеду',
    authorPrefix: 'Вы: ',
    time: 'Чт',
    unread: 0,
    online: false,
    muted: false,
    official: false,
    icon: null,
    sent: true,
  },
  {
    id: 'garden',
    title: 'Рассада и прочее',
    preview: 'Фото',
    authorPrefix: 'Тамара: ',
    time: 'Чт',
    unread: 0,
    online: false,
    muted: true,
    official: false,
    icon: 'camera',
    sent: false,
  },
  {
    id: 'vika',
    title: 'Вика Дорн',
    preview: 'Хорошо, до завтра',
    authorPrefix: '',
    time: '12 мая',
    unread: 0,
    online: false,
    muted: false,
    official: false,
    icon: null,
    sent: false,
  },
  {
    id: 'saved',
    title: 'Избранное',
    preview: 'Пароль от роутера',
    authorPrefix: 'Вы: ',
    time: '11 мая',
    unread: 0,
    online: false,
    muted: false,
    official: false,
    icon: null,
    sent: true,
  },
];

export const CHAT_FILTERS = ['Все', 'Непрочитанные', 'Личные', 'Группы'] as const;

export const TABS = [
  {
    id: 'chats',
    label: 'Сообщения',
    path: 'M4 4.5h12a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H9l-4 3v-3H4A1.5 1.5 0 012.5 12V6A1.5 1.5 0 014 4.5z',
  },
  {
    id: 'contacts',
    label: 'Контакты',
    path: 'M10 3.6a3 3 0 110 6 3 3 0 010-6zM4.4 16.4c.5-3 2.7-4.6 5.6-4.6s5.1 1.6 5.6 4.6',
  },
  {
    id: 'settings',
    label: 'Настройки',
    path: 'M3 6.5h1.5M7.5 6.5h9.5M3 13.5h6.5M12.5 13.5h4.5M6 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11 12a1.5 1.5 0 110 3 1.5 1.5 0 010-3z',
  },
  {
    id: 'profile',
    label: 'Профиль',
    path: 'M10 3.4a6.6 6.6 0 110 13.2 6.6 6.6 0 010-13.2zM10 7.6a2.2 2.2 0 110 4.4 2.2 2.2 0 010-4.4zM5.7 15.3c.8-1.7 2.3-2.6 4.3-2.6s3.5.9 4.3 2.6',
  },
] as const;

export const SEARCH_GLYPH = {
  circle: { cx: 7, cy: 7, r: 5 },
  handle: 'M11 11l4 4',
  stroke: 1.6,
} as const;

export const DOTS_GLYPH = [2, 8, 14] as const;

export interface ReplicaPhoto {
  src: string;
  ratio: number;
}

export const ALBUM_PHOTOS: ReplicaPhoto[] = [
  { src: '/download/album/pc-1.jpg', ratio: 600 / 450 },
  { src: '/download/album/pc-2.jpg', ratio: 600 / 450 },
  { src: '/download/album/pc-3.jpg', ratio: 600 / 450 },
];

export type ReplicaMessageKind = 'text' | 'album' | 'voice';

export interface ReplicaMessage {
  id: string;
  kind: ReplicaMessageKind;
  own: boolean;
  text: string;
  time: string;
  day: string | null;
  voiceDuration: string;
}

function message(part: Partial<ReplicaMessage> & Pick<ReplicaMessage, 'id' | 'own' | 'time'>): ReplicaMessage {
  return {
    kind: 'text',
    text: '',
    day: null,
    voiceDuration: '',
    ...part,
  };
}

export const VOICE_RECORD_SECONDS = 3;

export const TYPED_MESSAGE = 'Соболезную. Чем помочь?';

export const REACTION_EMOJI = '😔';

export const DIALOG: ReplicaMessage[] = [
  message({ id: 'm1', own: false, time: '22:14', text: 'Она опять всю ночь шумела', day: 'Вчера' }),
  message({ id: 'm2', own: false, time: '22:15', text: 'Под утро вроде затихла' }),
  message({ id: 'm3', own: true, time: '22:31', text: 'Может, врача вызвать?' }),
  message({ id: 'm4', own: false, time: '08:02', text: 'Мать ушла ночью', day: 'Сегодня' }),
  message({ id: 'm5', own: false, time: '09:17', text: 'Тихо, без мучений' }),
  message({ id: 'm6', own: true, time: '09:19', text: TYPED_MESSAGE }),
  message({ id: 'm7', own: false, time: '09:20', text: 'Приезжай с отвёрткой' }),
  message({ id: 'm8', own: false, time: '09:20', kind: 'album' }),
  message({ id: 'm9', own: false, time: '09:21', kind: 'voice', voiceDuration: '0:03' }),
];

export const DIALOG_BEFORE_REPLY = 5;
export const DIALOG_WITH_OWN_REPLY = 6;
export const DIALOG_WITH_PUNCHLINE = 7;
export const DIALOG_WITH_ALBUM = 8;
export const DIALOG_WITH_VOICE = 9;

export const READ_AT_REST = 3;
export const READ_WITH_OWN_REPLY = 6;

export const VOICE_PEAKS = [
  0.22, 0.38, 0.61, 0.44, 0.79, 0.92, 0.55, 0.33, 0.48, 0.71, 0.86, 0.64, 0.41, 0.29, 0.52, 0.77,
  0.95, 0.68, 0.45, 0.31, 0.58, 0.83, 0.72, 0.5, 0.36, 0.62, 0.88, 0.59, 0.42, 0.26,
];

export const QUICK_REACTIONS = ['❤️', '👍', '🔥', '😁', '😢', '🙏', '👏', '😱'];

export const MESSAGE_MENU_ITEMS = [
  { id: 'reply', icon: 'reply', label: 'Ответить' },
  { id: 'copy', icon: 'copy', label: 'Копировать' },
  { id: 'forward', icon: 'forward', label: 'Переслать' },
  { id: 'pin', icon: 'pin', label: 'Закрепить' },
  { id: 'delete', icon: 'trash', label: 'Удалить' },
] as const;

export const ATTACH_TILES = [
  { id: 'gallery', icon: 'image', label: 'Галерея' },
  { id: 'file', icon: 'file', label: 'Файл' },
] as const;

export const REPLICA_TEXT = {
  wordmark: 'Qwill',
  searchPlaceholder: 'Поиск чатов и людей',
  composerPlaceholder: 'Сообщение',
  chatSubtitle: 'в сети',
  attachTitle: 'Отправить',
  recordingHint: 'Отмена',
  voiceSpeed: '1×',
} as const;

export interface MenuAnchor {
  top: number;
  left: number;
  height: number;
  dropUp: boolean;
}

export const MENU_FALLBACK_ANCHOR: MenuAnchor = { top: 320, left: 12, height: 44, dropUp: false };

export const MENU_GAP = 8;

export const MENU_EDGE = 16;

export const REPLICA_REST: ReplicaState = {
  screen: 'chats',
  composerText: '',
  composerFocused: false,
  overlay: 'none',
  recording: false,
  menuMessageId: null,
  menuPick: null,
  reactionMessageId: null,
  pressed: null,
  visibleMessages: DIALOG_BEFORE_REPLY,
  readUpTo: READ_AT_REST,
};

export function typedPrefix(progress: number, state: ReplicaState): string {
  const clamped = Math.min(1, Math.max(0, progress));
  return state.composerText.slice(0, Math.round(clamped * state.composerText.length));
}

export function recordedTime(progress: number): string {
  const clamped = Math.min(1, Math.max(0, progress));
  const seconds = Math.floor(clamped * VOICE_RECORD_SECONDS);
  return `0:0${seconds}`;
}
