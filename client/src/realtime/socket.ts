import { SocketEvent, type VisibilityPayload } from '@messenger/shared';
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

let socket: Socket | null = null;

interface PendingEmit {
  event: string;
  payload: unknown;
}

const pendingEmits: PendingEmit[] = [];

function flushPendingEmits(target: Socket): void {
  const queued = pendingEmits.splice(0, pendingEmits.length);
  for (const item of queued) target.emit(item.event, item.payload);
}

export function emitWhenReady(event: string, payload: unknown): void {
  if (socket) {
    socket.emit(event, payload);
    return;
  }
  pendingEmits.push({ event, payload });
}

/** Сообщает серверу текущую видимость вкладки — по ней сервер решает, слать ли push при новом сообщении. */
function emitVisibility(): void {
  const payload: VisibilityPayload = { visible: document.visibilityState === 'visible' };
  socket?.emit(SocketEvent.VisibilityChange, payload);
}

/** Единственное место создания сокет-соединения (секция 4). Живое соединение при рефреше токена
 *  не рвётся: обновляется только `auth`, который socket.io читает при следующем реконнекте. */
export function connectSocket(accessToken: string): Socket {
  if (socket) {
    socket.auth = { token: accessToken };
    if (!socket.connected) socket.connect();
    flushPendingEmits(socket);
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    withCredentials: true,
  });
  socket.on('connect', emitVisibility);
  document.addEventListener('visibilitychange', emitVisibility);
  flushPendingEmits(socket);
  return socket;
}

export function disconnectSocket(): void {
  pendingEmits.length = 0;
  document.removeEventListener('visibilitychange', emitVisibility);
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

const SOCKET_WAIT_POLL_MS = 200;

/** Действие из системного интерфейса звонка приходит раньше, чем поднимается WebView и логин:
 *  ждём живой сокет, а не теряем отклонение или приём (шаг ЗВОНКИ-11). */
export function waitForConnectedSocket(timeoutMs = 20_000): Promise<Socket | null> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = (): void => {
      const current = getSocket();
      if (current?.connected) {
        resolve(current);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(check, SOCKET_WAIT_POLL_MS);
    };
    check();
  });
}
