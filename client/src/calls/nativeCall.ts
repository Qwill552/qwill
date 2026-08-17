import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CallKind } from '@messenger/shared';

import { waitForConnectedSocket } from '../realtime/socket';
import { useCallStore } from '../stores/callStore';

interface NativeCallPlugin {
  isNativeCallAvailable(): Promise<{ available: boolean }>;
  reportIncomingCall(options: { callId: string; callerName: string; callKind: CallKind }): Promise<void>;
  reportCallEnded(options: { callId: string }): Promise<void>;
  callConnected(): Promise<void>;
  addListener(
    eventName: 'callAccepted' | 'callDeclined',
    listener: (event: { callId: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const plugin = registerPlugin<NativeCallPlugin>('QwillCall');

let available = false;
let initialized = false;

/** Звонки, на которые уже ответили из системного интерфейса: приглашение по ним не должно
 *  показывать веб-экран входящего — человек уже согласился, спрашивать второй раз нельзя.
 *  Запись живёт до конца звонка, потому что подключением занимается быстрый путь ниже, а не
 *  обработчик приглашения. */
const acceptedNatively = new Set<string>();

const NATIVE_ACCEPT_SOCKET_TIMEOUT_MS = 60_000;

export function isNativeCallAvailable(): boolean {
  return available;
}

export async function initNativeCalls(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('QwillCall')) return;

  available = await plugin
    .isNativeCallAvailable()
    .then((result) => result.available)
    .catch(() => false);
  if (!available) return;

  await plugin.addListener('callAccepted', (event) => {
    void handleAccepted(event.callId);
  });
  await plugin.addListener('callDeclined', (event) => {
    void handleDeclined(event.callId);
  });

  useCallStore.subscribe((state, previous) => {
    if (state.phase === 'active' && previous.phase !== 'active') {
      void plugin.callConnected().catch(() => undefined);
    }
  });
}

export async function reportIncomingCall(callId: string, callerName: string, callKind: CallKind): Promise<void> {
  if (!available) return;
  await plugin.reportIncomingCall({ callId, callerName, callKind }).catch(() => undefined);
}

export async function reportCallEnded(callId: string): Promise<void> {
  acceptedNatively.delete(callId);
  if (!available) return;
  await plugin.reportCallEnded({ callId }).catch(() => undefined);
}

export function isAcceptedNatively(callId: string): boolean {
  return acceptedNatively.has(callId);
}

export function hasPendingNativeAccept(): boolean {
  return acceptedNatively.size > 0;
}

/** Ответ мог прийти раньше приглашения (приложение поднимается с нуля) или позже него
 *  (приложение было открыто, ответили с гарнитуры) — обрабатываются оба порядка.
 *  На холодном старте звонок не ждёт ни приглашения, ни списка чатов: как только сокет ожил,
 *  идёт сразу в joinCall. */
async function handleAccepted(callId: string): Promise<void> {
  const store = useCallStore.getState();
  if (store.call?.id === callId && store.phase === 'incoming') {
    await store.acceptCall();
    return;
  }

  acceptedNatively.add(callId);
  const socket = await waitForConnectedSocket(NATIVE_ACCEPT_SOCKET_TIMEOUT_MS);
  if (!socket || !acceptedNatively.has(callId)) return;

  const current = useCallStore.getState();
  if (current.phase !== 'idle') return;
  await current.joinCall(callId);
}

async function handleDeclined(callId: string): Promise<void> {
  acceptedNatively.delete(callId);
  await useCallStore.getState().declineCallById(callId);
}
