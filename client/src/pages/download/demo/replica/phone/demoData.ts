import replicaEmoji from './replicaEmoji.json';

export type ReplicaScreen = 'chats' | 'chat' | 'profile' | 'wallpaper' | 'call' | 'qr' | 'settings';

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
  wallpaperIndex: number;
  callConnected: boolean;
  hoverRow: string | null;
  search: boolean;
  searchQuery: string;
  chatPeer: ChatPeerId;
}

export const PRESS = {
  row: 'row-artem',
  bubble: 'm5',
  composer: 'composer',
  send: 'send',
  mic: 'mic',
  back: 'back',
  search: 'search',
  result: 'result',
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
  grisha: { id: 'grisha', name: 'Гриша', username: '@grisha' },
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
    authorPrefix: 'Гриша: ',
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
    id: 'grisha',
    title: PEOPLE.grisha.name,
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

export const REACTION_EMOJI: string = replicaEmoji.reaction;

export const DIALOG: ReplicaMessage[] = [
  message({ id: 'm1', own: false, time: '22:14', text: 'Она опять всю ночь шумела', day: 'Вчера' }),
  message({ id: 'm2', own: false, time: '22:15', text: 'Под утро вроде затихла' }),
  message({ id: 'm3', own: true, time: '22:31', text: 'Может, врача вызвать?' }),
  message({ id: 'm4', own: false, time: '08:02', text: 'Мать ушла ночью', day: 'Сегодня' }),
  message({ id: 'm5', own: false, time: '09:17', text: 'Тихо, без мучений' }),
  message({ id: 'm6', own: true, time: '09:19', text: TYPED_MESSAGE }),
  message({ id: 'm7', own: false, time: '09:20', text: 'Приезжай с отвёрткой' }),
  message({ id: 'm8', own: false, time: '09:20', kind: 'album' }),
  message({ id: 'm9', own: true, time: '09:21', kind: 'voice', voiceDuration: '0:03' }),
];

export const DIALOG_NINA: ReplicaMessage[] = [
  message({ id: 'n1', own: false, time: '18:40', text: 'Ключи у соседки, она до восьми', day: 'Сегодня' }),
  message({ id: 'n2', own: true, time: '18:41', text: 'Успею' }),
  message({ id: 'n3', own: false, time: '18:41', text: 'Заберу ключи после шести' }),
];

export type ChatPeerId = 'artem' | 'nina';

export interface ReplicaChatPeer {
  id: ChatPeerId;
  name: string;
  status: string;
  online: boolean;
}

export const CHAT_PEERS = {
  artem: { id: 'artem', name: PEOPLE.artem.name, status: 'в сети', online: true },
  nina: { id: 'nina', name: PEOPLE.nina.name, status: 'была недавно', online: false },
} as const satisfies Record<ChatPeerId, ReplicaChatPeer>;

export function dialogOf(peer: ChatPeerId): ReplicaMessage[] {
  return peer === 'nina' ? DIALOG_NINA : DIALOG;
}

export const DIALOG_NINA_FULL = DIALOG_NINA.length;

export const SEARCH_QUERY = 'Нина';

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

export const QUICK_REACTIONS: string[] = replicaEmoji.quick;

export const EMOJI_STRIP: string[] = [...new Set([...QUICK_REACTIONS, REACTION_EMOJI])];

export const EMOJI_STRIP_URL = '/download/emoji.webp';

export const REPLICA_EMOJI_SIZE = {
  menu: 22,
  pill: 16,
} as const;

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
  wallpaperIndex: 0,
  callConnected: false,
  hoverRow: null,
  search: false,
  searchQuery: '',
  chatPeer: 'artem',
};

export function typedPrefix(progress: number, state: ReplicaState): string {
  return prefixOf(state.composerText, progress);
}

export function searchedPrefix(progress: number, state: ReplicaState): string {
  return prefixOf(state.searchQuery, progress);
}

function prefixOf(text: string, progress: number): string {
  const clamped = Math.min(1, Math.max(0, progress));
  return text.slice(0, Math.round(clamped * text.length));
}

export function recordedTime(progress: number): string {
  const clamped = Math.min(1, Math.max(0, progress));
  const seconds = Math.floor(clamped * VOICE_RECORD_SECONDS);
  return `0:0${seconds}`;
}

export function callDuration(seconds: number): string {
  const clamped = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export const PROFILE_ACTIONS = [
  { id: 'chat', icon: 'chat-filled', label: 'Чат', solid: true },
  { id: 'sound', icon: 'bell-filled', label: 'Звук', solid: true },
  { id: 'call', icon: 'phone-filled', label: 'Звонок', solid: true },
  { id: 'more', icon: 'more-horizontal', label: 'Ещё', solid: false },
] as const;

export const PROFILE_TEXT = {
  status: 'не в сети',
  usernameLabel: 'Имя пользователя',
} as const;

export const MEDIA_TABS = ['Медиа', 'Файлы', 'Ссылки', 'Голосовые'] as const;

export const CARD_BUBBLE_TEXT = 'погладь меня';

export const CARD_PALETTE: Record<string, string> = {
  '#': '#28353e',
  T: '#2eb4ad',
  t: '#276571',
  c: '#fdedb9',
  e: '#28353e',
  i: '#276571',
  g: '#c4d78b',
  p: '#ec5986',
  o: '#f9ab97',
};

export const CARD_SPRITE: string[] = [
  '.....#.........#.....',
  '....#p#.......#p#....',
  '....##p#######p##....',
  '...#T#p#TTTTT#p#T#...',
  '...#Tt#TTTTTTT#tT#...',
  '..##TtTTTTTTTTTtTT#..',
  '..#TtTTTtTTTtTTTtT#..',
  '..#tTTTTcTTTcTTTtT#..',
  '..#TtTtTctTtcTtTtT#..',
  '..#TtTtcecTcectTtT#..',
  '.#TTtTTcicTcicTTtTT#.',
  '.#TTTtTcgcccgcTtTTT#.',
  '.#TTTt#occccco#tTTT#.',
  '#TTTT#.#######.#TTTT#',
  '#TtTT#.........#TTtT#',
  '#TTtTT#.......#TTtTT#',
  '.#TT##.........##TT#.',
  '..##.............##..',
];

export const CARD_SPRITE_COLS = 21;

export interface ReplicaWallpaperOption {
  id: string;
  title: string;
  kind: 'gradient' | 'pattern';
  value: string;
}

export const WALLPAPER_OPTIONS: ReplicaWallpaperOption[] = [
  { id: 'default', title: 'По теме', kind: 'gradient', value: 'var(--wallpaper-default)' },
  { id: 'summer', title: 'Лето', kind: 'gradient', value: 'var(--wallpaper-summer)' },
  { id: 'cats', title: 'Коты', kind: 'pattern', value: 'var(--wallpaper-default)' },
];

export const WALLPAPER_TEXT = {
  title: 'Обои чата',
  previewName: PEOPLE.grisha.name,
  previewMessages: ['Мангал беру на себя', 'Погнали часам к пяти'] as const,
} as const;

export const CALL_TEXT = {
  incoming: 'Входящий вызов…',
} as const;

export const QR_TEXT = {
  title: 'Мой QR-код',
  hint: 'Наведите камеру, чтобы открыть этот профиль в Qwill',
  button: 'Скопировать ссылку',
} as const;

export const QR_PATTERN: readonly (readonly boolean[])[] = buildQrPattern();

function buildQrPattern(): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  function paintFinder(top: number, left: number): void {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const onRing = r === 0 || r === 6 || c === 0 || c === 6;
        const onCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[top + r]![left + c] = onRing || onCore;
      }
    }
  }

  paintFinder(0, 0);
  paintFinder(0, size - 7);
  paintFinder(size - 7, 0);

  let seed = 42;
  function next(): number {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const inFinder =
        (r < 8 && c < 8) || (r < 8 && c > size - 9) || (r > size - 9 && c < 8);
      if (inFinder) continue;
      grid[r]![c] = next() > 0.56;
    }
  }

  return grid;
}

export const SETTINGS_SECTIONS = [
  [
    { id: 'account', icon: 'user', tint: 'blue', title: 'Аккаунт', subtitle: 'Номер, имя пользователя, «О себе»' },
    { id: 'appearance', icon: 'chats', tint: 'orange', title: 'Настройки чатов', subtitle: 'Обои, ночной режим, анимации' },
    { id: 'password', icon: 'lock', tint: 'green', title: 'Пароль', subtitle: 'Смена пароля от аккаунта' },
    { id: 'notifications', icon: 'bell', tint: 'pink', title: 'Уведомления', subtitle: 'Звуки, звонки, счётчик сообщений' },
  ],
  [
    { id: 'storage', icon: 'database', tint: 'teal', title: 'Данные и память', subtitle: 'Место на устройстве, очистка, автозагрузка' },
    { id: 'devices', icon: 'monitor', tint: 'violet', title: 'Устройства', subtitle: 'Управление активными сеансами' },
  ],
] as const;

export const SETTINGS_TEXT = {
  version: 'Qwill 1.3',
  license: 'AGPL-3.0',
} as const;

export const DESKTOP_MENU_ITEMS = [
  { id: 'profile', icon: 'user', label: 'Мой профиль' },
  { id: 'contacts', icon: 'users', label: 'Контакты' },
  { id: 'settings', icon: 'settings', label: 'Настройки' },
  { id: 'theme', icon: 'moon', label: 'Тёмная тема' },
] as const;

export const DESKTOP_TEXT = {
  searchPlaceholder: 'Поиск в Qwill',
  searchHotkey: 'Ctrl + K',
  recentLabel: 'Недавнее',
  foundLabel: 'Найдено',
  emptyTitle: 'Выберите чат',
  emptySubtitle: 'Откройте переписку из списка слева',
  profileCardTitle: 'Профиль',
  settingsCardTitle: 'Настройки',
} as const;

export const DESKTOP_RECENT_IDS = ['nina', 'grisha', 'katya'] as const;
