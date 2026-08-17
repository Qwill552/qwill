import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// .env лежит в корне монорепозитория, а не внутри server/.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const envFile = path.join(repoRoot, '.env');
if (existsSync(envFile)) {
  loadDotenv({ path: envFile, quiet: true });
}

const bytes = z.coerce.number().int().positive();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET должен быть не короче 32 символов'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  STORAGE_DIR: z.string().default('./storage'),
  APP_RELEASE_DIR: z.string().default('./releases'),
  MAX_FILE_SIZE_BYTES: bytes.default(2 * 1024 * 1024 * 1024),
  MAX_AVATAR_SIZE_BYTES: bytes.default(50 * 1024 * 1024),
  UPLOAD_CHUNK_SIZE_BYTES: bytes.default(5 * 1024 * 1024),
  STORAGE_LIMIT_GB: z.coerce.number().positive().default(100),
  STORAGE_POLICY: z.enum(['warn', 'evict']).default('warn'),

  /// Пара опциональна: без неё push просто не отправляется (лог warn), сервер не падает на старте.
  /// Сгенерировать: node -e "console.log(require('web-push').generateVAPIDKeys())" (секция 9).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@messenger.local'),

  /// Опционален по той же причине, что VAPID выше: без него FCM-канал просто не отправляет.
  /// JSON ключа сервисного аккаунта Firebase одной строкой (секция 10А).
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  LIVEKIT_URL: z.string().min(1, 'LIVEKIT_URL обязателен'),
  LIVEKIT_API_KEY: z.string().min(1, 'LIVEKIT_API_KEY обязателен'),
  LIVEKIT_API_SECRET: z.string().min(1, 'LIVEKIT_API_SECRET обязателен'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Падаем на старте, а не в рантайме (секция 3).
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(корень)'}: ${issue.message}`)
    .join('\n');
  console.error(`Некорректная конфигурация окружения:\n${issues}\n\nСверьтесь с .env.example`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isDev: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  isProd: raw.NODE_ENV === 'production',
  /** Абсолютный путь к приватному хранилищу файлов. */
  storageDir: path.resolve(repoRoot, raw.STORAGE_DIR),
  /** Абсолютный путь к каталогу выпусков: манифест android.json и APK рядом с ним. */
  appReleaseDir: path.resolve(repoRoot, raw.APP_RELEASE_DIR),
  /** Разрешённые origin'ы клиента: список через запятую в CLIENT_ORIGIN. */
  clientOrigins: raw.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;

const MKCERT_DIR = path.join(homedir(), '.vite-plugin-mkcert');
const MKCERT_KEY_FILE = path.join(MKCERT_DIR, 'dev.pem');
const MKCERT_CERT_FILE = path.join(MKCERT_DIR, 'cert.pem');

export const devHttpsCredentials =
  env.isDev && existsSync(MKCERT_KEY_FILE) && existsSync(MKCERT_CERT_FILE)
    ? { key: readFileSync(MKCERT_KEY_FILE), cert: readFileSync(MKCERT_CERT_FILE) }
    : null;

/** Любой приватный LAN-адрес (192.168.*, 10.*, 172.16-31.*) на порту клиентского dev-сервера —
 *  открыть dev-сайт с телефона в той же сети (см. CLAUDE.md, «Среда разработки (Windows)»).
 *  Только для CLIENT_PORT из .env (дефолт 5173 в vite.config.ts), IP меняется по DHCP —
 *  фиксировать его в CLIENT_ORIGIN пришлось бы вручную при каждой смене сети. */
const PRIVATE_LAN_ORIGIN =
  /^https?:\/\/(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$/;

/**
 * Разрешён ли origin для CORS/Socket.io (`server/src/app.ts`, `server/src/realtime/index.ts`).
 * Прод: точный список `clientOrigins`, без исключений. Dev: тот же список плюс любой origin
 * из приватного LAN-диапазона — не нужно вручную дописывать CLIENT_ORIGIN при каждой смене IP.
 * `origin === undefined` — запрос без заголовка Origin (curl, health-check, тот же origin) —
 * пропускаем, как и раньше пропускал `cors()` с массивом (браузер CORS тут вообще не применяет).
 */
export function isAllowedClientOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (env.clientOrigins.includes(origin)) return true;
  return env.isDev && PRIVATE_LAN_ORIGIN.test(origin);
}
