import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CardFontDto } from '@messenger/shared';

import { env } from '../config/env.js';
import { logger } from './logger.js';

export const PROFILE_FONTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/profile-fonts',
);

/**
 * Второй каталог — рядом со `storage`, то есть вне каталога выпуска. Положенный туда `.woff2`
 * переживает деплой, в отличие от того, что лежит в репозитории внутри выпуска. При совпадении
 * имени побеждает этот.
 */
export const PROFILE_FONTS_PERSISTENT_DIR = path.join(env.storageDir, 'profile-fonts');

const FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+\.woff2$/;
const FAMILY_PATTERN = /^[A-Za-z0-9 _-]{1,64}$/;

const WEIGHT_BY_SUFFIX: Record<string, number> = {
  '': 400,
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

interface FontFace {
  file: string;
  path: string;
  family: string;
  weight: number;
  italic: boolean;
}

interface FontTable {
  faces: FontFace[];
  css: string;
  families: CardFontDto[];
  files: Map<string, string>;
}

let table: FontTable | null = null;

function parseFace(file: string, dir: string): FontFace | null {
  const stem = file.slice(0, -'.woff2'.length);
  const fullPath = path.join(dir, file);
  const dash = stem.lastIndexOf('-');

  if (dash > 0) {
    const suffix = stem.slice(dash + 1).toLowerCase();
    const italic = suffix.endsWith('italic');
    const weightKey = italic ? suffix.slice(0, -'italic'.length) : suffix;
    const weight = WEIGHT_BY_SUFFIX[weightKey];
    if (weight !== undefined) {
      const family = stem.slice(0, dash);
      return FAMILY_PATTERN.test(family) ? { file, path: fullPath, family, weight, italic } : null;
    }
  }

  return FAMILY_PATTERN.test(stem) ? { file, path: fullPath, family: stem, weight: 400, italic: false } : null;
}

function buildCss(faces: FontFace[]): string {
  return faces
    .map(
      (face) =>
        `@font-face{font-family:"${face.family}";` +
        `src:url("/fonts/${face.file}") format("woff2");` +
        `font-weight:${face.weight};` +
        `font-style:${face.italic ? 'italic' : 'normal'};` +
        'font-display:swap}',
    )
    .join('');
}

function buildFamilies(faces: FontFace[]): CardFontDto[] {
  const byFamily = new Map<string, CardFontDto>();
  for (const face of faces) {
    const entry = byFamily.get(face.family) ?? { family: face.family, weights: [], hasItalic: false };
    if (!entry.weights.includes(face.weight)) entry.weights.push(face.weight);
    if (face.italic) entry.hasItalic = true;
    byFamily.set(face.family, entry);
  }
  return [...byFamily.values()]
    .map((entry) => ({ ...entry, weights: [...entry.weights].sort((a, b) => a - b) }))
    .sort((a, b) => a.family.localeCompare(b.family, 'ru'));
}

function scanInto(dir: string, byFile: Map<string, FontFace>, required: boolean): void {
  if (!existsSync(dir)) {
    if (required) logger.warn({ dir }, 'Папки шрифтов визитки нет — список шрифтов пуст');
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!FILE_NAME_PATTERN.test(entry.name)) {
      if (!entry.name.startsWith('.') && entry.name.toLowerCase() !== 'readme.md') {
        logger.warn({ dir, file: entry.name }, 'Шрифт визитки пропущен: годятся только .woff2 с именем из латиницы');
      }
      continue;
    }
    const face = parseFace(entry.name, dir);
    if (!face) {
      logger.warn({ dir, file: entry.name }, 'Шрифт визитки пропущен: имя семейства не годится для CSS');
      continue;
    }
    byFile.set(face.file, face);
  }
}

function scan(): FontTable {
  const byFile = new Map<string, FontFace>();
  scanInto(PROFILE_FONTS_DIR, byFile, true);
  scanInto(PROFILE_FONTS_PERSISTENT_DIR, byFile, false);

  const faces = [...byFile.values()];
  return {
    faces,
    css: buildCss(faces),
    families: buildFamilies(faces),
    files: new Map(faces.map((face) => [face.file, face.path])),
  };
}

export function initProfileFonts(): void {
  table = scan();
  logger.info(
    { families: table.families.length, faces: table.faces.length, persistentDir: PROFILE_FONTS_PERSISTENT_DIR },
    'Шрифты визитки просканированы',
  );
}

function ensureTable(): FontTable {
  table ??= scan();
  return table;
}

export function getProfileFontFaceCss(): string {
  return ensureTable().css;
}

export function getProfileFontFamilies(): CardFontDto[] {
  return ensureTable().families;
}

export function resolveProfileFontPath(fileName: string): string | null {
  return ensureTable().files.get(fileName) ?? null;
}
