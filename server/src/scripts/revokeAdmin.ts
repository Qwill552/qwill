import { prisma } from '../db/prisma.js';
import { revokeAdminRole } from '../services/admin.js';

async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error('Использование: npm run revoke-admin -- <username>');
    process.exitCode = 1;
    return;
  }

  const { user, changed } = await revokeAdminRole(username);

  if (!changed) {
    console.log(`@${user.username} не администратор — ничего не изменено.`);
    return;
  }

  console.log(`@${user.username} (${user.displayName}) — роль администратора снята.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
