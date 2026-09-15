import zlib from 'node:zlib';

import { BrowserWindow, Notification, app, ipcMain, nativeImage, type NativeImage } from 'electron';

import { routeDeepLink } from './deeplink';
import { focusExistingWindow } from './window';

const NOTIFY_CHANNEL = 'qwill:notify';
const BADGE_CHANNEL = 'qwill:set-badge-count';
const CLOSE_CHAT_CHANNEL = 'qwill:close-chat-notifications';

const BADGE_SIZE = 16;
const BADGE_COLOR: readonly [number, number, number] = [108, 116, 250];

const DIGIT_GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
};

interface NotifyPayload {
  title: string;
  body: string;
  chatId: string;
}

function isNotifyPayload(value: unknown): value is NotifyPayload {
  const candidate = value as Partial<NotifyPayload> | null;
  return (
    !!candidate &&
    typeof candidate.title === 'string' &&
    typeof candidate.body === 'string' &&
    typeof candidate.chatId === 'string'
  );
}

const shownByChat = new Map<string, Notification[]>();

function forget(chatId: string, notification: Notification): void {
  const shown = shownByChat.get(chatId);
  if (!shown) return;

  const rest = shown.filter((candidate) => candidate !== notification);
  if (rest.length === 0) shownByChat.delete(chatId);
  else shownByChat.set(chatId, rest);
}

function showMessageNotification(payload: NotifyPayload): void {
  if (!Notification.isSupported()) return;

  const notification = new Notification({ title: payload.title, body: payload.body, silent: true });
  notification.on('click', () => {
    focusExistingWindow();
    routeDeepLink({ type: 'chat', id: payload.chatId });
  });
  notification.on('close', () => forget(payload.chatId, notification));
  notification.show();

  shownByChat.set(payload.chatId, [...(shownByChat.get(payload.chatId) ?? []), notification]);
}

function closeChatNotifications(chatId: string): void {
  const shown = shownByChat.get(chatId);
  if (!shown) return;

  shownByChat.delete(chatId);
  for (const notification of shown) notification.close();
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size: number, rgba: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function drawCircle(pixels: Buffer, size: number, color: readonly [number, number, number]): void {
  const center = (size - 1) / 2;
  const radius = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      if (dx * dx + dy * dy > radius * radius) continue;
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
}

function drawGlyph(pixels: Buffer, size: number, glyph: string[], originX: number, originY: number, scale: number): void {
  for (let row = 0; row < glyph.length; row++) {
    const line = glyph[row] ?? '';
    for (let col = 0; col < line.length; col++) {
      if (line[col] !== '1') continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const x = originX + col * scale + sx;
          const y = originY + row * scale + sy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const offset = (y * size + x) * 4;
          pixels[offset] = 255;
          pixels[offset + 1] = 255;
          pixels[offset + 2] = 255;
          pixels[offset + 3] = 255;
        }
      }
    }
  }
}

function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count);
}

const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;
const GLYPH_GAP = 1;

const badgeIconCache = new Map<string, NativeImage>();

function renderBadgeIcon(count: number): NativeImage {
  const text = badgeText(count);
  const cached = badgeIconCache.get(text);
  if (cached) return cached;

  const pixels = Buffer.alloc(BADGE_SIZE * BADGE_SIZE * 4);
  drawCircle(pixels, BADGE_SIZE, BADGE_COLOR);

  const scale = text.length === 1 ? 2 : 1;
  const totalWidth = text.length * GLYPH_WIDTH * scale + (text.length - 1) * GLYPH_GAP;
  const originY = Math.round((BADGE_SIZE - GLYPH_HEIGHT * scale) / 2);
  let originX = Math.round((BADGE_SIZE - totalWidth) / 2);

  for (const char of text) {
    const glyph = DIGIT_GLYPHS[char];
    if (glyph) drawGlyph(pixels, BADGE_SIZE, glyph, originX, originY, scale);
    originX += GLYPH_WIDTH * scale + GLYPH_GAP;
  }

  const icon = nativeImage.createFromBuffer(encodePng(BADGE_SIZE, pixels));
  badgeIconCache.set(text, icon);
  return icon;
}

let lastBadgeCount = -1;

function applyBadgeCount(count: number): void {
  if (count === lastBadgeCount) return;
  lastBadgeCount = count;

  app.setBadgeCount(count);
  const overlay = count > 0 ? renderBadgeIcon(count) : null;
  const description = count > 0 ? `${count} непрочитанных` : '';
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.setOverlayIcon(overlay, description);
  }
}

export function registerNotifications(): void {
  ipcMain.on(NOTIFY_CHANNEL, (_event, payload: unknown) => {
    if (isNotifyPayload(payload)) showMessageNotification(payload);
  });

  ipcMain.on(BADGE_CHANNEL, (_event, payload: unknown) => {
    if (typeof payload !== 'number' || !Number.isFinite(payload)) return;
    applyBadgeCount(Math.max(0, Math.round(payload)));
  });

  ipcMain.on(CLOSE_CHAT_CHANNEL, (_event, chatId: unknown) => {
    if (typeof chatId !== 'string' || chatId === '') return;
    closeChatNotifications(chatId);
  });
}
