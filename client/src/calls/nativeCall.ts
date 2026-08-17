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
 *  Запись снимает тот из двух путей подключения, который успел первым. */
const acceptedNatively = new Set<string>();

const NATIVE_ACCEPT_SOCKET_TIMEOUT_MS = 60_000;
const NATIVE_ACCEPT_RETRY_MS = 7000;
const NATIVE_ACCEPT_RETRIES = 2;

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

export function consumeNativeAccept(callId: string): boolean {
  return acceptedNatively.delete(callId);
}

export function hasPendingNativeAccept(): boolean {
  return acceptedNatively.size > 0;
}

/** Ответ мог прийти раньше приглашения (приложение поднимается с нуля) или позже него
 *  (приложение было открыто, ответили с гарнитуры) — обрабатываются оба порядка.
 *  На холодном старте звонок дополнительно идёт в joinCall сам, как только ожил сокет, не
 *  дожидаясь приглашения: что из двух случится раньше, то и подключит. */
async function handleAccepted(callId: string): Promise<void> {
  const store = useCallStore.getState();
  if (store.call?.id === callId && store.phase === 'incoming') {
    await store.acceptCall();
    return;
  }

  acceptedNatively.add(callId);
  watchNativeAccept(callId);

  const socket = await waitForConnectedSocket(NATIVE_ACCEPT_SOCKET_TIMEOUT_MS);
  if (!socket || !consumeNativeAccept(callId)) return;

  const current = useCallStore.getState();
  if (current.phase !== 'idle') return;
  await current.joinCall(callId);
}

/** Оверлей «Соединение…» снимается только переходом в active, поэтому проигранная гонка или
 *  потерянный ack оставили бы человека на нём до 45-секундной страховки оболочки. `call === null`
 *  означает, что ответа на call:accept не было вовсе — только тогда пробуем ещё раз. */
function watchNativeAccept(callId: string): void {
  let attempts = 0;
  const tick = (): void => {
    const state = useCallStore.getState();
    if (state.call?.id === callId || state.phase !== 'idle') return;
    if (attempts >= NATIVE_ACCEPT_RETRIES) return;

    attempts += 1;
    acceptedNatively.delete(callId);
    void state.joinCall(callId).then(() => {
      if (useCallStore.getState().call === null) setTimeout(tick, NATIVE_ACCEPT_RETRY_MS);
    });
  };
  setTimeout(tick, NATIVE_ACCEPT_RETRY_MS);
}

async function handleDeclined(callId: string): Promise<void> {
  acceptedNatively.delete(callId);
  await useCallStore.getState().declineCallById(callId);
}
