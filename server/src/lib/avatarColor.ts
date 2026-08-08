import type { AvatarColor } from '@messenger/shared';
import { AVATAR_COLOR_VALUES } from '@messenger/shared';

/** Колонка User.avatarColor хранится обычной строкой — сверяем со списком палитры, а не
 *  доверяем ей вслепую (тот же приём, что у theme/fontSize/surface в services/user.ts). */
export function toAvatarColor(value: string): AvatarColor {
  return (AVATAR_COLOR_VALUES as readonly string[]).includes(value) ? (value as AvatarColor) : 'blue';
}

/** Назначается один раз при регистрации (services/user.ts, createUser) и больше не меняется. */
export function randomAvatarColor(): AvatarColor {
  return AVATAR_COLOR_VALUES[Math.floor(Math.random() * AVATAR_COLOR_VALUES.length)] ?? 'blue';
}
