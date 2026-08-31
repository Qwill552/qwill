import { env, envFileExists, envFilePath } from '../config/env.js';
import { sendTelegramMessageRaw, telegramNotifyState } from '../lib/telegram.js';

function mask(value: string | undefined): string {
  if (!value) return '(не задано)';
  const [botId] = value.split(':');
  return `${botId ?? '?'}:*** (длина ${value.length})`;
}

function describeRaw(name: string): string {
  const raw = process.env[name];
  if (raw === undefined) return '(нет в process.env)';
  return `${JSON.stringify(raw)} (длина ${raw.length})`;
}

async function main(): Promise<void> {
  console.log('=== 1. Файл окружения ===');
  console.log(`Ожидаемый путь: ${envFilePath}`);
  console.log(`Файл существует: ${envFileExists ? 'да' : 'НЕТ'}`);
  console.log('');

  console.log('=== 2. Сырые значения в process.env ===');
  console.log(`TELEGRAM_NOTIFY_ENABLED: ${describeRaw('TELEGRAM_NOTIFY_ENABLED')}`);
  console.log(`TELEGRAM_ADMIN_CHAT_ID:  ${describeRaw('TELEGRAM_ADMIN_CHAT_ID')}`);
  console.log(`TELEGRAM_BOT_TOKEN:      ${process.env.TELEGRAM_BOT_TOKEN ? mask(process.env.TELEGRAM_BOT_TOKEN) : '(нет в process.env)'}`);
  console.log('');

  console.log('=== 3. После разбора конфигурации ===');
  console.log(`TELEGRAM_NOTIFY_ENABLED: ${String(env.TELEGRAM_NOTIFY_ENABLED)}`);
  console.log(`TELEGRAM_ADMIN_CHAT_ID:  ${env.TELEGRAM_ADMIN_CHAT_ID ?? '(не задано)'}`);
  console.log(`TELEGRAM_BOT_TOKEN:      ${mask(env.TELEGRAM_BOT_TOKEN)}`);
  console.log(`APP_ORIGIN (ссылка в уведомлении): ${env.APP_ORIGIN}`);
  console.log('');

  const state = telegramNotifyState();
  console.log('=== 4. Состояние уведомлений ===');
  if (!state.configured) {
    console.log(`ВЫКЛЮЧЕНЫ. Не задано: ${state.missing.join(', ')}`);
    console.log('Отправка пропускается — сервер шлёт уведомления только при всех трёх заданных значениях.');
    process.exitCode = 1;
    return;
  }
  console.log('ВКЛЮЧЕНЫ — все три значения на месте.');
  console.log('');

  console.log('=== 5. Пробная отправка в Telegram ===');
  try {
    const { status, body } = await sendTelegramMessageRaw(
      'Проверка связи Qwill: если вы видите это сообщение, бот настроен верно.',
    );
    console.log(`HTTP ${status}`);
    console.log(`Ответ Telegram: ${body}`);
    if (status !== 200) {
      console.log('');
      console.log('Отправка отклонена. 401 — неверный или отозванный токен; 400 с "chat not found" —');
      console.log('неверный TELEGRAM_ADMIN_CHAT_ID или боту ещё не писали из этого чата.');
      process.exitCode = 1;
      return;
    }
    console.log('');
    console.log('Успех: сообщение ушло. Проверьте чат с ботом.');
  } catch (error) {
    console.log('Запрос не дошёл до Telegram вовсе.');
    console.log(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    console.log('');
    console.log('Так выглядит закрытый исходящий доступ к api.telegram.org (файрвол, DNS, таймаут).');
    console.log('Проверить руками: curl -sS -m 10 https://api.telegram.org');
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
