import { z } from 'zod';

import type { CallKind } from './chat.js';

/** Тело PushSubscription из browser PushManager — endpoint уникален и служит естественным ключом (этап 9). */
export const pushSubscribeWebSchema = z.object({
  provider: z.literal('webpush'),
  endpoint: z.string().trim().min(1, 'endpoint обязателен'),
  keys: z.object({
    p256dh: z.string().trim().min(1, 'Не хватает ключа p256dh'),
    auth: z.string().trim().min(1, 'Не хватает ключа auth'),
  }),
});

export const pushSubscribeFcmSchema = z.object({
  provider: z.literal('fcm'),
  token: z.string().trim().min(1, 'token обязателен'),
});

export const pushSubscribeSchema = z.discriminatedUnion('provider', [pushSubscribeWebSchema, pushSubscribeFcmSchema]);
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeWebSchema = z.object({
  provider: z.literal('webpush'),
  endpoint: z.string().trim().min(1, 'endpoint обязателен'),
});

export const pushUnsubscribeFcmSchema = z.object({
  provider: z.literal('fcm'),
  token: z.string().trim().min(1, 'token обязателен'),
});

export const pushUnsubscribeSchema = z.discriminatedUnion('provider', [pushUnsubscribeWebSchema, pushUnsubscribeFcmSchema]);
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

/** Отклонение звонка прямо из системного интерфейса Android: приложение при этом не
 *  запускается, токена доступа у нативного слоя нет, и удостоверением служит сам
 *  FCM-токен устройства — он уже привязан к пользователю подпиской (шаг ЗВОНКИ-11). */
export const deviceCallDeclineSchema = z.object({
  callId: z.string().trim().min(1, 'callId обязателен'),
  fcmToken: z.string().trim().min(1, 'fcmToken обязателен'),
});
export type DeviceCallDeclineInput = z.infer<typeof deviceCallDeclineSchema>;

/** Полезная нагрузка push-уведомления — канал доставки решает, как её показать (SW для webpush, FCM data для нативного).
 *  Поля звонка заполняются только при kind === 'call': по ним оболочка Android поднимает
 *  системный входящий вызов, не дожидаясь загрузки WebView (шаг ЗВОНКИ-11). */
export interface PushNotificationPayload {
  title: string;
  body: string;
  chatId: string;
  kind?: 'message' | 'call';
  callId?: string;
  callerName?: string;
  callKind?: CallKind;
}
