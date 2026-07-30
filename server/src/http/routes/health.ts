import { Router } from 'express';

import { prisma } from '../../db/prisma.js';

export const healthRouter: Router = Router();

/** Проверка живости всей цепочки: процесс отвечает и БД доступна. */
healthRouter.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok', time: new Date().toISOString() });
});
