import { prisma } from '../db/prisma.js';
import { liftIpBanFromConsole } from '../services/ipBan.js';

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('Использование: npm run ip-unban -- <cidr|адрес|id>');
    process.exitCode = 1;
    return;
  }

  const ban = await liftIpBanFromConsole(target);
  if (!ban) {
    console.error(`Действующая блокировка «${target}» не найдена.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Блокировка ${ban.cidr} снята.`);
  console.log('Работающий сервер подхватит снятие в течение 15 секунд, перезапуск не нужен.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
