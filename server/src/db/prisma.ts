import { PrismaPg } from '@prisma/adapter-pg';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { PrismaClient } from '../generated/prisma/client.js';

// Prisma 7 работает через driver adapter: строка подключения приходит из env,
// а не из schema.prisma (там её больше нет).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.isDev ? ['warn', 'error'] : ['error'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('База данных подключена');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
