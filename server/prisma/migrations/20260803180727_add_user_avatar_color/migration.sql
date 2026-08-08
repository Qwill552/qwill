-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarColor" TEXT NOT NULL DEFAULT 'blue';

-- Разово раздать уже существующим пользователям случайный цвет из палитры (shared/src/user.ts,
-- AVATAR_COLOR_VALUES), иначе все они схлопнутся в один общий дефолт 'blue'. Новые пользователи
-- получают цвет явно в server/src/services/user.ts (randomAvatarColor), эта строка их не касается.
UPDATE "User"
SET "avatarColor" = (ARRAY['blue','violet','teal','orange','pink','green'])[floor(random() * 6) + 1];
