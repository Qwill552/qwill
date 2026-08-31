import { ADMIN_REAUTH_FAIL_LIMIT, ADMIN_REAUTH_LOCK_MINUTES } from '@messenger/shared';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { notifyAdmin } from '../lib/telegram.js';
import { countUnread } from './chat.js';

const ADMIN_PANEL_LINK = `${env.APP_ORIGIN}/admin`;

function formatMoscow(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

interface LoginContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

function loginLines(context: LoginContext): string {
  return `Устройство: ${context.userAgent ?? 'неизвестно'}\nIP: ${context.ip ?? 'неизвестен'}\nВремя: ${formatMoscow(new Date())}`;
}

export function notifyAdminLoginSuccess(context: LoginContext): void {
  notifyAdmin(
    'admin_login_success',
    () => `Вход в админский аккаунт.\n${loginLines(context)}\n${ADMIN_PANEL_LINK}`,
  );
}

export function notifyAdminLoginFailure(context: LoginContext): void {
  notifyAdmin(
    'admin_login_fail',
    () => `Неудачная попытка входа в админский аккаунт.\n${loginLines(context)}\n${ADMIN_PANEL_LINK}`,
  );
}

export function notifyAdminPanelAccess(context: LoginContext): void {
  notifyAdmin(
    'admin_reauth_success',
    () => `Открыта админ-панель, пароль подтверждён.\n${loginLines(context)}\n${ADMIN_PANEL_LINK}`,
  );
}

export function notifyAdminPanelFailure(context: LoginContext, locked: boolean): void {
  if (locked) {
    notifyAdmin(
      'admin_reauth_lock',
      () =>
        `Неверный пароль в админ-панели ${ADMIN_REAUTH_FAIL_LIMIT} раз подряд — выдача доступа заблокирована на ${ADMIN_REAUTH_LOCK_MINUTES} минут.\n${loginLines(context)}\n${ADMIN_PANEL_LINK}`,
    );
    return;
  }

  notifyAdmin(
    'admin_reauth_fail',
    () => `Неверный пароль в админ-панели.\n${loginLines(context)}\n${ADMIN_PANEL_LINK}`,
  );
}

export function notifyNewReport(): void {
  notifyAdmin('new_report', async () => {
    const openCount = await prisma.report.count({ where: { status: { not: 'closed' } } });
    return `Новая жалоба. Открытых жалоб: ${openCount}.\n${ADMIN_PANEL_LINK}`;
  });
}

async function unresolvedSupportChatCount(adminId: string): Promise<number> {
  const memberships = await prisma.chatMember.findMany({
    where: { userId: adminId, chat: { isSupportRequest: true } },
    select: { chatId: true, lastReadMessageId: true, clearedUpToMessageId: true },
  });

  let unresolved = 0;
  for (const membership of memberships) {
    const unread = await countUnread(
      membership.chatId,
      adminId,
      membership.lastReadMessageId,
      membership.clearedUpToMessageId,
    );
    if (unread > 0) unresolved += 1;
  }
  return unresolved;
}

export function notifySupportMessage(adminId: string): void {
  notifyAdmin('support_message', async () => {
    const unresolvedCount = await unresolvedSupportChatCount(adminId);
    return `Новое сообщение в Предложке. Необработанных: ${unresolvedCount}.\n${ADMIN_PANEL_LINK}`;
  });
}

export function notifyBanAction(kind: 'ban' | 'unban'): void {
  notifyAdmin(`ban_action:${kind}`, () => {
    const text = kind === 'ban' ? 'Пользователь забанен.' : 'Пользователь разбанен.';
    return `${text}\n${ADMIN_PANEL_LINK}`;
  });
}
