import { BrowserWindow, desktopCapturer, ipcMain, type DesktopCapturerSource } from 'electron';

const REQUEST_CHANNEL = 'qwill:screen-sources';
const RESPONSE_CHANNEL = 'qwill:screen-source-chosen';
const THUMBNAIL_SIZE = { width: 320, height: 180 };

interface ScreenSourcePayload {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
  appIcon: string | null;
}

interface PendingChoice {
  requestId: number;
  settle: (sourceId: string | null) => void;
}

let nextRequestId = 1;
let pending: PendingChoice | null = null;

function toPayload(source: DesktopCapturerSource): ScreenSourcePayload {
  const icon = source.appIcon;
  return {
    id: source.id,
    name: source.name,
    kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: icon && !icon.isEmpty() ? icon.toDataURL() : null,
  };
}

function settlePending(sourceId: string | null, requestId?: number): void {
  if (!pending) return;
  if (requestId !== undefined && pending.requestId !== requestId) return;
  const { settle } = pending;
  pending = null;
  settle(sourceId);
}

export function registerScreenSourcePicker(): void {
  ipcMain.on(RESPONSE_CHANNEL, (_event, payload: unknown) => {
    const answer = payload as { requestId?: unknown; sourceId?: unknown };
    if (typeof answer?.requestId !== 'number') return;
    settlePending(typeof answer.sourceId === 'string' ? answer.sourceId : null, answer.requestId);
  });
}

export async function pickScreenSource(): Promise<DesktopCapturerSource | null> {
  const [window] = BrowserWindow.getAllWindows();
  if (!window || window.isDestroyed()) return null;

  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: THUMBNAIL_SIZE,
    fetchWindowIcons: true,
  });
  const offered = sources.filter((source) => source.name.trim() !== '');
  if (offered.length === 0) return null;

  settlePending(null);

  const requestId = nextRequestId++;
  const contents = window.webContents;
  const cancel = (): void => settlePending(null, requestId);
  contents.once('destroyed', cancel);

  try {
    const chosenId = await new Promise<string | null>((settle) => {
      pending = { requestId, settle };
      contents.send(REQUEST_CHANNEL, { requestId, sources: offered.map(toPayload) });
    });
    return offered.find((source) => source.id === chosenId) ?? null;
  } finally {
    contents.off('destroyed', cancel);
  }
}
