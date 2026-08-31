import { env } from '../config/env.js';
import { logger } from './logger.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const SEND_TIMEOUT_MS = 5000;
const THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const HOURLY_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;
const CEILING_MESSAGE = 'Уведомления зачастили — до конца часа новые не придут.';

const configured = Boolean(
  env.TELEGRAM_NOTIFY_ENABLED && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID,
);

export interface TelegramNotifyState {
  configured: boolean;
  missing: string[];
}

export function telegramNotifyState(): TelegramNotifyState {
  const missing: string[] = [];
  if (!env.TELEGRAM_NOTIFY_ENABLED) missing.push('TELEGRAM_NOTIFY_ENABLED');
  if (!env.TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  if (!env.TELEGRAM_ADMIN_CHAT_ID) missing.push('TELEGRAM_ADMIN_CHAT_ID');
  return { configured, missing };
}

export async function sendTelegramMessageRaw(text: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  return { status: response.status, body: await response.text() };
}

const lastSentAt = new Map<string, number>();

let hourStart = Date.now();
let hourCount = 0;
let ceilingAnnouncedThisHour = false;

function rollHourWindow(now: number): void {
  if (now - hourStart < HOUR_MS) return;
  hourStart = now;
  hourCount = 0;
  ceilingAnnouncedThisHour = false;
}

async function post(text: string): Promise<void> {
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, 'Telegram sendMessage отклонён');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Не удалось отправить уведомление в Telegram');
  }
}

function reserveHourlySlot(): boolean {
  const now = Date.now();
  rollHourWindow(now);

  if (hourCount < HOURLY_LIMIT) {
    hourCount += 1;
    return true;
  }

  if (!ceilingAnnouncedThisHour) {
    ceilingAnnouncedThisHour = true;
    post(CEILING_MESSAGE).catch(() => undefined);
  } else {
    logger.warn('Уведомление в Telegram пропущено: часовой потолок исчерпан');
  }
  return false;
}

export function notifyAdmin(type: string, render: () => string | Promise<string>): void {
  if (!configured) return;

  const now = Date.now();
  const last = lastSentAt.get(type);
  if (last !== undefined && now - last < THROTTLE_WINDOW_MS) {
    logger.debug({ type }, 'Уведомление в Telegram пропущено: тип уже отправлялся в этом окне');
    return;
  }
  lastSentAt.set(type, now);

  if (!reserveHourlySlot()) return;

  logger.info({ type }, 'Отправляю уведомление администратору в Telegram');

  Promise.resolve()
    .then(render)
    .then(post)
    .catch((error: unknown) => {
      logger.warn({ err: error }, 'Не удалось подготовить уведомление в Telegram');
    });
}
