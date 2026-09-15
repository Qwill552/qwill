import path from 'node:path';

import { BrowserWindow, app, ipcMain } from 'electron';

const PROTOCOL = 'qwill';
const DEEP_LINK_CHANNEL = 'qwill:deep-link';
const PENDING_CHANNEL = 'qwill:deep-link-pending';

export type DeepLinkTarget = { type: 'chat'; id: string } | { type: 'user'; id: string };

let pendingDeepLink: DeepLinkTarget | null = null;

function parseDeepLink(url: string): DeepLinkTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${PROTOCOL}:`) return null;

  const id = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!id) return null;
  if (parsed.hostname === 'chat') return { type: 'chat', id };
  if (parsed.hostname === 'user') return { type: 'user', id };
  return null;
}

function findDeepLinkArg(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
}

export function routeDeepLink(target: DeepLinkTarget): void {
  pendingDeepLink = target;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(DEEP_LINK_CHANNEL, target);
  }
}

export function routeDeepLinkFromArgv(argv: string[]): void {
  const url = findDeepLinkArg(argv);
  if (!url) return;
  const target = parseDeepLink(url);
  if (target) routeDeepLink(target);
}

export function registerDeepLinkProtocol(): void {
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(PROTOCOL);
    return;
  }
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1] ?? '.')]);
}

export function registerDeepLinkBridge(): void {
  ipcMain.handle(PENDING_CHANNEL, () => {
    const target = pendingDeepLink;
    pendingDeepLink = null;
    return target;
  });
}
