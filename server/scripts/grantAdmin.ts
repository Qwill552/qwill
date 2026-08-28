import { PASSWORD_MIN_LENGTH } from '@messenger/shared';

import { prisma } from '../src/db/prisma.js';
import { grantAdminRole } from '../src/services/admin.js';

const ADMIN_PASSWORD_MIN_LENGTH = 24;

async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error('Использование: npm run grant-admin -- <username>');
    process.exitCode = 1;
    return;
  }

  const { user, changed } = await grantAdminRole(username);

  if (!changed) {
    console.log(`@${user.username} уже администратор — ничего не изменено.`);
    return;
  }

  console.log(`@${user.username} (${user.displayName}) — роль администратора выдана.`);
  console.log(
    `Требуется сменить пароль до первого запроса к API: не короче ${ADMIN_PASSWORD_MIN_LENGTH} символов ` +
      `(обычный минимум — ${PASSWORD_MIN_LENGTH}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
