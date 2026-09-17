import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readEnvFile() {
  const file = path.join(repoRoot, '.env');
  if (!existsSync(file)) return {};

  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
  return values;
}

const fileEnv = readEnvFile();
const token = process.env.ANNOUNCE_TOKEN ?? fileEnv.ANNOUNCE_TOKEN;
const baseUrl = process.env.ANNOUNCE_URL ?? 'http://127.0.0.1:3000';

if (!token) {
  console.error('ANNOUNCE_TOKEN не задан — ни в окружении, ни в .env. Рассылать нечем.');
  process.exit(1);
}

const KNOWN_PLATFORMS = ['android', 'windows'];
const platforms = process.argv.slice(2).map((value) => value.trim().toLowerCase()).filter(Boolean);
const unknown = platforms.filter((value) => !KNOWN_PLATFORMS.includes(value));

if (platforms.length === 0 || unknown.length > 0) {
  if (unknown.length > 0) console.error(`Неизвестная платформа: ${unknown.join(', ')}`);
  console.error('Укажите платформы выпуска явно, умолчания нет:');
  console.error('  npm run announce -- android');
  console.error('  npm run announce -- windows');
  console.error('  npm run announce -- android windows');
  console.error('Названа лишняя платформа — людям на ней скажут обновиться на версию, которой нет.');
  process.exit(1);
}

const response = await fetch(new URL('/api/app/announce', baseUrl), {
  method: 'POST',
  headers: { 'x-announce-token': token, 'content-type': 'application/json' },
  body: JSON.stringify({ platforms: [...new Set(platforms)] }),
});

const body = await response.text();

if (!response.ok) {
  console.error(`Рассылка не удалась (${response.status}): ${body}`);
  process.exit(1);
}

const result = JSON.parse(body);
const versions = [
  result.androidVersionName ? `Android ${result.androidVersionName}` : null,
  result.windowsVersionName ? `Windows ${result.windowsVersionName}` : null,
]
  .filter(Boolean)
  .join(', ');

console.log(
  `Объявление (${versions}): доставлено ${result.delivered}, ошибок ${result.failed}` +
    (result.alreadyPublished ? ' — этот выпуск уже рассылался, повторы не создавались' : ''),
);
