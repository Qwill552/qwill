import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Нет Docker/тестовой БД в окружении (см. windows-dev-toolchain-constraints) — тесты
    // ходят в реальный dev Postgres и не должны гоняться параллельно друг с другом.
    fileParallelism: false,
    // dotenv в config/env.ts не переопределяет уже заданные переменные — этим глушим pino-http
    // (у самого pino нет уровня тише 'fatal' в схеме env.ts).
    env: {
      LOG_LEVEL: 'fatal',
      FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"test","client_email":"test@test.iam.gserviceaccount.com","private_key":"test"}',
    },
  },
});
