import { streamUrl, VIDEO_SOURCE_MESSAGE, VIDEO_SOURCE_REQUEST_MESSAGE } from '../cache/videoCache';
import { buildFileSrc, getFileToken, refreshFileToken } from './files';

const SOURCE_ACK_TIMEOUT_MS = 2000;

function controller(): ServiceWorker | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.controller;
}

let listening = false;

function listenForSourceRequests(): void {
  if (listening) return;
  listening = true;

  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; fileId?: string } | null;
    if (data?.type !== VIDEO_SOURCE_REQUEST_MESSAGE || typeof data.fileId !== 'string') return;

    const port = event.ports[0];
    if (!port) return;

    const fileId = data.fileId;
    void refreshFileToken(fileId)
      .then((token) => port.postMessage({ url: buildFileSrc(fileId, token) }))
      .catch(() => port.postMessage({ url: null }));
  });
}

function sendSource(target: ServiceWorker, fileId: string, url: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), SOURCE_ACK_TIMEOUT_MS);

    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };

    try {
      target.postMessage({ type: VIDEO_SOURCE_MESSAGE, fileId, url }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

const resolved = new Map<string, Promise<string>>();
const disabled = new Set<string>();

function resolutionKey(fileId: string, progressive: boolean): string {
  return `${progressive ? 'sw' : 'direct'}:${fileId}`;
}

export function disableProgressiveStream(fileId: string): void {
  disabled.add(fileId);
  resolved.delete(resolutionKey(fileId, true));
}

async function resolve(fileId: string, chatId: string | null, progressive: boolean): Promise<string> {
  const direct = buildFileSrc(fileId, await getFileToken(fileId));
  if (!progressive || disabled.has(fileId)) return direct;

  const worker = controller();
  if (!worker) return direct;

  listenForSourceRequests();
  const delivered = await sendSource(worker, fileId, direct);
  return delivered ? streamUrl(fileId, chatId) : direct;
}

export function resolveStreamSrc(fileId: string, chatId: string | null, progressive: boolean): Promise<string> {
  const key = resolutionKey(fileId, progressive);
  const known = resolved.get(key);
  if (known) return known;

  const pending = resolve(fileId, chatId, progressive).catch((error: unknown) => {
    resolved.delete(key);
    throw error;
  });
  resolved.set(key, pending);
  return pending;
}
