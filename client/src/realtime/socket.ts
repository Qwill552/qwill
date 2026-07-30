import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let socket: Socket | null = null;

/** Единственное место создания сокет-соединения (секция 4). Переподключается при каждом логине/рефреше токена. */
export function connectSocket(accessToken: string): Socket {
  disconnectSocket();
  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    withCredentials: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
