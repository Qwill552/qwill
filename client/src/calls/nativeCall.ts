import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CallKind } from '@messenger/shared';

import { waitForConnectedSocket } from '../realtime/socket';
import { useCallStore } from '../stores/callStore';
import { traceCall } from './callTrace';

export type CallBackgroundStyle = 'glow' | 'blobs';

interface NativeCallPlugin {
  isNativeCallAvailable(): Promise<{ available: boolean }>;
  reportIncomingCall(options: { callId: string; callerName: string; callKind: CallKind }): Promise<void>;
  reportCallEnded(options: { callId: string }): Promise<void>;
  setCallBackgroundStyle(options: { style: CallBackgroundStyle }): Promise<void>;
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
const NATIVE_ACCEPT_RETRY_MS = 2000;
const NATIVE_ACCEPT_RETRIES = 2;

export function isNativeCallAvailable(): boolean {
  return available;
}

export function isNativeShell(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('QwillCall');
}

export async function setCallBackgroundStyle(style: CallBackgroundStyle): Promise<void> {
  if (!isNativeShell()) return;
  await plugin.setCallBackgroundStyle({ style }).catch(() => undefined);
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
 *  (приложение было открыто, ответили с гарнитуры) — обрабатываются оба порядка. */
async function handleAccepted(callId: string): Promise<void> {
  traceCall('нативный accept получен', callId);
  acceptedNatively.add(callId);
  watchNativeAccept(callId);

  traceCall('ожидание сокета началось');
  const socket = await waitForConnectedSocket(NATIVE_ACCEPT_SOCKET_TIMEOUT_MS);
  traceCall('ожидание сокета закончилось', socket ? 'сокет живой' : 'таймаут');
  if (!socket) return;
  await enterAcceptedCall(callId);
}

/** Единственное место, где принятый в системном интерфейсе звонок доводится до разговора.
 *  Разбирает все три состояния стора, а не только `idle`: приглашение по сокету могло успеть
 *  раньше нативного события и увести фазу в `incoming`, и тогда молчаливый выход оставлял бы
 *  человека на оверлее «Соединение…» навсегда. */
async function enterAcceptedCall(callId: string): Promise<boolean> {
  const store = useCallStore.getState();
  const isOurCall = store.call?.id === callId;
  consumeNativeAccept(callId);

  if (isOurCall && store.phase === 'incoming') {
    await store.acceptCall();
    return useCallStore.getState().call !== null;
  }

  if (isOurCall) return true;

  if (store.phase !== 'idle') return false;

  await store.joinCall(callId);
  return useCallStore.getState().call !== null;
}

/** Оверлей «Соединение…» снимается только переходом в active, поэтому проигранная гонка или
 *  потерянный ack оставили бы человека на нём до 45-секундной страховки оболочки. Сторож
 *  переспрашивает состояние, а не сдаётся на первой же неподходящей фазе. */
function watchNativeAccept(callId: string): void {
  let attempts = 0;
  const tick = (): void => {
    if (attempts >= NATIVE_ACCEPT_RETRIES) return;
    attempts += 1;

    traceCall('сторож входа в звонок: попытка', String(attempts));
    void enterAcceptedCall(callId).then((entered) => {
      if (!entered) setTimeout(tick, NATIVE_ACCEPT_RETRY_MS);
    });
  };
  setTimeout(tick, NATIVE_ACCEPT_RETRY_MS);
}

async function handleDeclined(callId: string): Promise<void> {
  traceCall('нативный decline получен', callId);
  acceptedNatively.delete(callId);
  await useCallStore.getState().declineCallById(callId);
}
