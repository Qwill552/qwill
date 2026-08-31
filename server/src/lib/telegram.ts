import { env } from '../config/env.js';
import { logger } from './logger.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const SEND_TIMEOUT_MS = 5000;
const BATCH_WINDOW_MS = 10 * 60 * 1000;
const HOURLY_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;
const CEILING_MESSAGE = 'Уведомления зачастили — до конца часа новые не придут.';

const configured = Boolean(
  env.TELEGRAM_NOTIFY_ENABLED && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID,
);

interface PendingBatch {
  count: number;
  render: (count: number) => string | Promise<string>;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingBatch>();

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

function flush(type: string): void {
  const batch = pending.get(type);
  pending.delete(type);
  if (!batch) return;
  if (!reserveHourlySlot()) return;

  Promise.resolve(batch.render(batch.count))
    .then(post)
    .catch((error: unknown) => {
      logger.warn({ err: error }, 'Не удалось подготовить уведомление в Telegram');
    });
}

export function notifyAdmin(type: string, render: (count: number) => string | Promise<string>): void {
  if (!configured) return;

  const existing = pending.get(type);
  if (existing) {
    existing.count += 1;
    existing.render = render;
    return;
  }

  pending.set(type, {
    count: 1,
    render,
    timer: setTimeout(() => flush(type), BATCH_WINDOW_MS),
  });
}
