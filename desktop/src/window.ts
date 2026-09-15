import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BrowserWindow, app, screen, shell } from 'electron';

import { appIcon } from './appIcon';
import { APP_ORIGIN } from './protocol';

type Theme = 'light' | 'dark';

interface WindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
  theme: Theme;
}

const DEFAULT_STATE: WindowState = {
  width: 1280,
  height: 840,
  x: null,
  y: null,
  maximized: false,
  theme: 'light',
};
const MIN_WIDTH = 900;
const MIN_HEIGHT = 560;
const SAVE_DEBOUNCE_MS = 400;
const TITLEBAR_HEIGHT = 32;

const BACKGROUND_BY_THEME: Record<Theme, string> = {
  light: '#eef1f6',
  dark: '#0a0c12',
};

const TITLEBAR_SYMBOL_BY_THEME: Record<Theme, string> = {
  light: '#1c202d',
  dark: '#eef1f7',
};

let activeTheme: Theme = DEFAULT_STATE.theme;

function stateFilePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseState(raw: unknown): WindowState {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_STATE;
  const candidate = raw as Partial<WindowState>;
  return {
    width: isPositiveNumber(candidate.width) ? Math.max(candidate.width, MIN_WIDTH) : DEFAULT_STATE.width,
    height: isPositiveNumber(candidate.height) ? Math.max(candidate.height, MIN_HEIGHT) : DEFAULT_STATE.height,
    x: isCoordinate(candidate.x) ? candidate.x : null,
    y: isCoordinate(candidate.y) ? candidate.y : null,
    maximized: candidate.maximized === true,
    theme: candidate.theme === 'dark' ? 'dark' : 'light',
  };
}

function readState(): WindowState {
  try {
    return parseState(JSON.parse(readFileSync(stateFilePath(), 'utf8')));
  } catch {
    return DEFAULT_STATE;
  }
}

function fitsOnSomeDisplay(state: WindowState): boolean {
  if (state.x === null || state.y === null) return false;
  return screen.getAllDisplays().some((display) => {
    const { x, y, width, height } = display.workArea;
    return (
      (state.x as number) >= x - 40 &&
      (state.y as number) >= y - 40 &&
      (state.x as number) < x + width &&
      (state.y as number) < y + height
    );
  });
}

function collectState(window: BrowserWindow): WindowState {
  const bounds = window.getNormalBounds();
  return {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: window.isMaximized(),
    theme: activeTheme,
  };
}

function trackGeometry(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;
  let pending = collectState(window);

  function persist(): void {
    try {
      writeFileSync(stateFilePath(), JSON.stringify(pending), 'utf8');
    } catch {
      return;
    }
  }

  function schedule(): void {
    if (window.isDestroyed()) return;
    pending = collectState(window);
    if (timer) clearTimeout(timer);
    timer = setTimeout(persist, SAVE_DEBOUNCE_MS);
  }

  window.on('resize', schedule);
  window.on('move', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('close', () => {
    if (timer) clearTimeout(timer);
    pending = collectState(window);
    persist();
  });
}

function keepNavigationInside(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(APP_ORIGIN)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
}

export async function createMainWindow(
  entryUrl: string,
  options: { startHidden?: boolean } = {},
): Promise<BrowserWindow> {
  const state = readState();
  const usePosition = fitsOnSomeDisplay(state);
  activeTheme = state.theme;

  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: usePosition ? (state.x as number) : undefined,
    y: usePosition ? (state.y as number) : undefined,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    icon: appIcon(),
    backgroundColor: BACKGROUND_BY_THEME[state.theme],
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: TITLEBAR_SYMBOL_BY_THEME[state.theme],
      height: TITLEBAR_HEIGHT,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  if (state.maximized) window.maximize();

  window.once('ready-to-show', () => {
    if (!options.startHidden) window.show();
  });
  keepNavigationInside(window);
  trackGeometry(window);

  await window.loadURL(entryUrl);
  return window;
}

export function windowTheme(): Theme {
  return activeTheme;
}

export function setWindowTitleTheme(theme: Theme): void {
  activeTheme = theme;
  for (const window of BrowserWindow.getAllWindows()) {
    window.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: TITLEBAR_SYMBOL_BY_THEME[theme],
      height: TITLEBAR_HEIGHT,
    });
    window.setBackgroundColor(BACKGROUND_BY_THEME[theme]);
  }
  try {
    writeFileSync(stateFilePath(), JSON.stringify({ ...readState(), theme }), 'utf8');
  } catch {
    return;
  }
}

export function enforceDesktopWidth(): void {
  const [window] = BrowserWindow.getAllWindows();
  if (!window || window.isDestroyed()) return;

  const minimum = Math.ceil(MIN_WIDTH * window.webContents.getZoomFactor());
  window.setMinimumSize(minimum, MIN_HEIGHT);

  const bounds = window.getBounds();
  const available = screen.getDisplayMatching(bounds).workArea.width;
  const width = Math.min(minimum, available);
  if (bounds.width < width) window.setBounds({ ...bounds, width });
}

export function focusExistingWindow(): void {
  const [existing] = BrowserWindow.getAllWindows();
  if (!existing) return;
  if (existing.isMinimized()) existing.restore();
  existing.show();
  existing.focus();
}
