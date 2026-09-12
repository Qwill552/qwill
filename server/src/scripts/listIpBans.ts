import { prisma } from '../db/prisma.js';
import { listActiveIpBans } from '../services/ipBan.js';

function until(expiresAt: string | null): string {
  return expiresAt ? `до ${new Date(expiresAt).toLocaleString('ru-RU')}` : 'бессрочно';
}

async function main(): Promise<void> {
  const bans = await listActiveIpBans();
  if (bans.length === 0) {
    console.log('Действующих блокировок нет.');
    return;
  }

  console.log(`Действующих блокировок: ${bans.length}`);
  for (const ban of bans) {
    const author = ban.createdByUsername ? `@${ban.createdByUsername}` : 'неизвестно кем';
    console.log(`${ban.cidr}  ${until(ban.expiresAt)}  ${author}  ${ban.reason}`);
    console.log(`  id: ${ban.id}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
