import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CallKind } from '@messenger/shared';

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
 *  показывать веб-экран входящего — человек уже согласился, спрашивать второй раз нельзя. */
const acceptedNatively = new Set<string>();

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

/** Ответ мог прийти раньше приглашения (приложение поднимается с нуля) или позже него
 *  (приложение было открыто, ответили с гарнитуры) — обрабатываются оба порядка. */
async function handleAccepted(callId: string): Promise<void> {
  const store = useCallStore.getState();
  if (store.call?.id === callId && store.phase === 'incoming') {
    await store.acceptCall();
    return;
  }
  acceptedNatively.add(callId);
}

async function handleDeclined(callId: string): Promise<void> {
  acceptedNatively.delete(callId);
  await useCallStore.getState().declineCallById(callId);
}
