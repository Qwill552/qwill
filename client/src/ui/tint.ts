import type { AvatarColor } from '@messenger/shared';

/** Восемь тонов из палитры. Ими красятся имена авторов в группах — один и тот же человек
 *  обязан быть одного цвета везде и после перезагрузки, поэтому выбор идёт хешем от
 *  устойчивого ключа (userId, chatId), а не случайным числом. */
export const TINTS = [
  'violet',
  'blue',
  'orange',
  'green',
  'teal',
  'pink',
  'indigo',
  'red',
] as const;

export type Tint = (typeof TINTS)[number];

export function tintFor(key: string): Tint {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length] ?? TINTS[0];
}

/** Готовая CSS-переменная тона — чтобы вызывающие не собирали строку руками. */
export function tintVar(key: string): string {
  return `var(--tint-${tintFor(key)})`;
}

/** Буквально палитра AV из референса (design-archive/reference/…/Pulse Messenger.dc.html,
 *  строки 376-383) — шесть двухцветных градиентов буквенных аватаров. Отдельно от TINTS
 *  выше: это не то же множество и не тот же формат (пара для градиента, а не один тон). */
const AVATAR_GRADIENTS = [
  'linear-gradient(140deg, #4d8dff, #2f6fe0)',
  'linear-gradient(140deg, #a05aff, #6d3ce0)',
  'linear-gradient(140deg, #00c8b4, #079a8c)',
  'linear-gradient(140deg, #ffb057, #f07d2a)',
  'linear-gradient(140deg, #ff6b9d, #e0447a)',
  'linear-gradient(140deg, #3ddc84, #1faf63)',
] as const;

/** Хеш-фолбэк — только для сущностей без персонального AvatarColor (группа, «Избранное»):
 *  для человека всегда есть закреплённый на сервере цвет, см. avatarGradientForColor ниже. */
export function avatarGradientFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length] ?? AVATAR_GRADIENTS[0];
}

/** Порядок буквально совпадает с AVATAR_COLOR_VALUES (@messenger/shared) и AVATAR_GRADIENTS выше:
 *  blue/violet/teal/orange/pink/green. Персональный цвет человека закреплён на сервере при
 *  регистрации и приходит вместе с DTO — здесь только маппинг ключа на готовый градиент,
 *  без пересчёта хешем (avatarGradientFor выше остаётся только для сущностей без своего цвета —
 *  групп и «Избранного», у которых нет присвоенного пользователю AvatarColor). */
const AVATAR_GRADIENT_BY_COLOR: Record<AvatarColor, string> = {
  blue: AVATAR_GRADIENTS[0],
  violet: AVATAR_GRADIENTS[1],
  teal: AVATAR_GRADIENTS[2],
  orange: AVATAR_GRADIENTS[3],
  pink: AVATAR_GRADIENTS[4],
  green: AVATAR_GRADIENTS[5],
};

export function avatarGradientForColor(color: AvatarColor): string {
  return AVATAR_GRADIENT_BY_COLOR[color];
}
