import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { subscribePushRequest, unsubscribePushRequest } from '../api/push';

export function isNativePushAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');
}

let listenersAttached = false;
let lastToken: string | null = null;

function openChatFromNotification(data: Record<string, string> | undefined): void {
  const chatId = data?.chatId;
  if (chatId) window.location.assign(`/chats/${encodeURIComponent(chatId)}`);
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  PushNotifications.addListener('registration', (token) => {
    lastToken = token.value;
    subscribePushRequest({ provider: 'fcm', token: token.value }).catch(() => undefined);
  });
  PushNotifications.addListener('registrationError', () => undefined);
  PushNotifications.addListener('pushNotificationReceived', () => undefined);
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    openChatFromNotification(action.notification.data as Record<string, string> | undefined);
  });
}

export async function registerNativePush(): Promise<void> {
  if (!isNativePushAvailable()) return;

  attachListeners();

  const permission = await PushNotifications.checkPermissions();
  const status = permission.receive === 'prompt' ? (await PushNotifications.requestPermissions()).receive : permission.receive;
  if (status !== 'granted') return;

  await PushNotifications.register();
}

export async function unregisterNativePush(): Promise<void> {
  if (!isNativePushAvailable()) return;

  if (lastToken) {
    await unsubscribePushRequest({ provider: 'fcm', token: lastToken }).catch(() => undefined);
    lastToken = null;
  }
  await PushNotifications.removeAllListeners();
  listenersAttached = false;
}
