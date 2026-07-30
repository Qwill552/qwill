# Messenger

Мессенджер на Express 5 + Socket.io + Prisma и React 19 + Vite.
План работ и все принятые решения — в [`project-design.md`](./project-design.md).

## Структура

```
messenger/
├─ server/    Express 5 + TypeScript, Socket.io, Prisma
├─ client/    Vite + React 19 + TypeScript
├─ shared/    общие типы: DTO, контракты socket-событий, Zod-схемы
├─ legacy/    старое приложение — только как справочный материал, в сборку не входит
└─ docker-compose.yml    только Postgres
```

## Запуск

Нужен Node ≥ 22.12 и Postgres 16+.

```bash
npm install
cp .env.example .env        # затем заполнить DATABASE_URL и JWT_SECRET
npm run db:migrate          # применить схему
npm run dev                 # http://localhost:5173 (клиент) + http://localhost:3000 (API)
```

Если Postgres не установлен локально, его можно поднять в Docker:

```bash
npm run db:up
```

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | shared в watch-режиме + сервер (tsx watch) + клиент (vite) |
| `npm run build` | сборка всех трёх пакетов |
| `npm run typecheck` | `tsc --noEmit` по всем пакетам |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:studio` | Prisma Studio |

## Переменные окружения

Один `.env` в корне — его читают и сервер (через `server/src/config/env.ts`), и Vite.
Схема и значения по умолчанию описаны в `.env.example`; при некорректном значении
сервер падает на старте, а не в рантайме.
