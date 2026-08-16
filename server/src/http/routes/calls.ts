import { deviceCallDeclineSchema } from '@messenger/shared';
import { Router } from 'express';

import { prisma } from '../../db/prisma.js';
import { unauthorized } from '../../lib/errors.js';
import { finishCall } from '../../realtime/call-handlers.js';
import { validateBody } from '../middleware/validate.js';

export const callsRouter = Router();

/** Отклонение с заблокированного телефона: WebView в этот момент не поднят и сокета нет,
 *  поэтому звонящий узнаёт об отказе отсюда, а не через веб-слой (шаг ЗВОНКИ-11). */
callsRouter.post('/decline', validateBody(deviceCallDeclineSchema), async (req, res, next) => {
  try {
    const { callId, fcmToken } = req.body as { callId: string; fcmToken: string };

    const subscription = await prisma.pushSubscription.findUnique({
      where: { fcmToken },
      select: { userId: true },
    });
    if (!subscription) throw unauthorized('Устройство не зарегистрировано');

    await finishCall(callId, subscription.userId, 'DECLINED');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
