import { existsSync } from 'node:fs';
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
  /** Разрешённые origin'ы клиента: список через запятую в CLIENT_ORIGIN. */
  clientOrigins: raw.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
