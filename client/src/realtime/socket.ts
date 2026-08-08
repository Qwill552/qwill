import { SocketEvent, type VisibilityPayload } from '@messenger/shared';
import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

let socket: Socket | null = null;

/** Сообщает серверу текущую видимость вкладки — по ней сервер решает, слать ли push при новом сообщении. */
function emitVisibility(): void {
  const payload: VisibilityPayload = { visible: document.visibilityState === 'visible' };
  socket?.emit(SocketEvent.VisibilityChange, payload);
}

/** Единственное место создания сокет-соединения (секция 4). Переподключается при каждом логине/рефреше токена. */
export function connectSocket(accessToken: string): Socket {
  disconnectSocket();
  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    withCredentials: true,
  });
  socket.on('connect', emitVisibility);
  document.addEventListener('visibilitychange', emitVisibility);
  return socket;
}

export function disconnectSocket(): void {
  document.removeEventListener('visibilitychange', emitVisibility);
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
