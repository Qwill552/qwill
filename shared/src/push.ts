import { z } from 'zod';

/** Тело PushSubscription из browser PushManager — endpoint уникален и служит естественным ключом (этап 9). */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().trim().min(1, 'endpoint обязателен'),
  keys: z.object({
    p256dh: z.string().trim().min(1, 'Не хватает ключа p256dh'),
    auth: z.string().trim().min(1, 'Не хватает ключа auth'),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1, 'endpoint обязателен'),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

/** Полезная нагрузка web push — SW сам решает, как отрисовать уведомление (этап 9). */
export interface PushNotificationPayload {
  title: string;
  body: string;
  chatId: string;
  kind?: 'message' | 'call';
}
