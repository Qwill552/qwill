# Messenger — архитектурная шпаргалка

> Этот файл передаётся Claude Code **один раз** в начале сессии вместо полного project-design.md.
> Полный план — в project-design.md (читай его только когда явно попросят).

---

## Монорепозиторий

```
messenger/
├─ shared/     типы, Zod-схемы — единственный источник контрактов
├─ server/     Express 5 + Socket.io + Prisma
└─ client/     Vite + React 19 + Zustand
```

---

## Правило слоёв (никогда не нарушать)

```
shared/types.ts + shared/validation.ts
       ↓
server/services/        ← вся бизнес-логика живёт здесь
       ↓
server/http/routes/     ← только вызов сервиса + валидация
server/realtime/        ← только вызов сервиса + emit
       ↓
client/api/             ← типизированные fetch-вызовы
client/stores/          ← Zustand: chatStore, authStore, uiStore
       ↓
client/features/        ← React-компоненты
```

**Логика не живёт в routes/ или компонентах. Только в services/.**

---

## Безопасность (обязательно в каждом сервисе)

```typescript
// 1. Всегда первым делом в любой операции с чатом:
await assertMember(chatId, userId)   // бросает AppError(NOT_A_MEMBER, 403)

// 2. Стандартные ошибки:
throw new AppError('NOT_A_MEMBER',   403)
throw new AppError('FORBIDDEN',      403)
throw new AppError('CHAT_NOT_FOUND', 404)
throw new AppError('VALIDATION',     400)

// 3. Наружу уходит только { error: { code, message } }
// Стек и детали — только в логе с requestId
```

---

## Токены (схема)

```
access  — JWT 15 мин, в памяти вкладки (не в localStorage)
refresh — случайная строка, в БД хранится только hash, ротируется при каждом use
logout  — DELETE Session из БД → всё, токен мёртв
```

API-клиент на клиенте: поймал 401 → молча обновил access → повторил запрос → если снова 401 → редирект /login.

---

## Socket-события (полный список)

```
клиент → сервер:
  message:send · message:edit · message:delete · message:react
  chat:read · typing:start · typing:stop

сервер → клиент:
  message:new · message:updated · message:deleted · message:reaction
  chat:created · chat:updated · member:changed
  user:typing · user:presence · chat:read
```

**Подписка на ВСЕ чаты пользователя при коннекте** — не при открытии чата.
**Ack + clientId** — оптимистичный пузырь заменяется реальным, повтор не создаёт дубль.

---

## Ключевые решения БД

```
lastReadMessageId на ChatMember   — не is_read на Message (это фиксит группы)
File отдельно от Attachment       — дедупликация по SHA-256
deletedAt + пустой content       — мягкое удаление, ответы не рассыпаются
Файлы в приватной папке          — раздача через /api/files/:id с проверкой членства
```

---

## Паттерн: новая фича (чеклист)

```
1. shared/     → добавить тип/DTO + Zod-схему
2. server/     → migration (если нужна) → service-метод → route → socket-хендлер
3. tests/      → unit (логика) + integration (route) + security.test.ts (403-кейсы)
4. client/     → api-метод → store action → компонент
```

---

## Паттерн: service-метод (шаблон)

```typescript
async doSomething(chatId: string, userId: string, data: SomeDTO) {
  await assertMember(chatId, userId)           // 1. проверка доступа

  const result = await this.db.something.create({  // 2. запрос к БД
    data: { ...data, chatId, userId }
  })

  this.io.to(chatId).emit('event:name', result)    // 3. broadcast в комнату

  return result                                     // 4. вернуть клиенту
}
```

---

## Что удалено из старого проекта

`server.js` · `init_db.js/2/3` · `migrations/` · Cropper.js CDN · рукописный `sw.js`
Весь старый код — не трогать, не переносить.

---

## Стек (кратко)

| | Выбор |
|---|---|
| Backend | Express 5 + TypeScript |
| ORM | Prisma (schema → migration → типы) |
| Realtime | Socket.io |
| Frontend | React 19 + Vite + TypeScript |
| State | Zustand |
| Styles | CSS Modules + CSS-переменные |
| Validation | Zod (в shared/, одна схема на оба конца) |
| Tests | Vitest + Supertest + Playwright |

---

## Цвета (токены)

```css
--primary: #8c52ff  (тёмная: #a074ff)
--bg:      #f6f4fb  (тёмная: #15131c)
--surface: #ffffff  (тёмная: #1e1b28)
--message-out: #ede2ff  (тёмная: #4a3378)
--message-in:  #ffffff  (тёмная: #262233)
```

Liquid glass — только экран /login. В остальном интерфейсе не применяется.
