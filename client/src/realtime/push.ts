import { subscribePushRequest, unsubscribePushRequest } from '../api/push';
import { registerServiceWorker } from '../app/serviceWorker';
import { isNativePushAvailable, registerNativePush, unregisterNativePush } from './nativePush';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** PushManager ждёт ключ в виде Uint8Array, сервер и .env хранят его в base64url (стандартный формат VAPID). */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function subscriptionToDto(subscription: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  };
}

/** Вызывается после логина — если разрешение уже дано или ещё не спрошено (не 'denied'), см. authStore (этап 9).
 *  В оболочке Capacitor уходит по нативному каналу (FCM) — web push там недоступен в принципе (секция 10А). */
export async function subscribeToPush(): Promise<void> {
  if (isNativePushAvailable()) {
    await registerNativePush().catch((error) => console.error('registerNativePush failed', error));
    return;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) return;
  if (Notification.permission === 'denied') return;

  try {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return;

    await registerServiceWorker();
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // ES2023-таргет типизирует Uint8Array как Uint8Array<ArrayBufferLike>, DOM ждёт <ArrayBuffer> (известное расхождение lib).
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));

    await subscribePushRequest({ provider: 'webpush', ...subscriptionToDto(subscription) });
  } catch (error) {
    // Пуши — не критичная функция: не бросаем дальше, но логируем причину для диагностики.
    console.error('subscribeToPush failed', error);
  }
}

export async function unsubscribePush(): Promise<void> {
  if (isNativePushAvailable()) {
    await unregisterNativePush().catch(() => undefined);
    return;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await unsubscribePushRequest({ provider: 'webpush', endpoint });
  } catch {
    // Не критично — сервер сам подчистит мёртвую подписку при следующей отправке (410 Gone).
  }
}
