import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CardFontDto } from '@messenger/shared';

import { logger } from './logger.js';

export const PROFILE_FONTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/profile-fonts',
);

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
  family: string;
  weight: number;
  italic: boolean;
}

interface FontTable {
  faces: FontFace[];
  css: string;
  families: CardFontDto[];
  files: Set<string>;
}

let table: FontTable | null = null;

function parseFace(file: string): FontFace | null {
  const stem = file.slice(0, -'.woff2'.length);
  const dash = stem.lastIndexOf('-');

  if (dash > 0) {
    const suffix = stem.slice(dash + 1).toLowerCase();
    const italic = suffix.endsWith('italic');
    const weightKey = italic ? suffix.slice(0, -'italic'.length) : suffix;
    const weight = WEIGHT_BY_SUFFIX[weightKey];
    if (weight !== undefined) {
      const family = stem.slice(0, dash);
      return FAMILY_PATTERN.test(family) ? { file, family, weight, italic } : null;
    }
  }

  return FAMILY_PATTERN.test(stem) ? { file, family: stem, weight: 400, italic: false } : null;
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

function scan(): FontTable {
  const faces: FontFace[] = [];

  if (!existsSync(PROFILE_FONTS_DIR)) {
    logger.warn({ dir: PROFILE_FONTS_DIR }, 'Папки шрифтов визитки нет — список шрифтов пуст');
    return { faces, css: '', families: [], files: new Set() };
  }

  for (const entry of readdirSync(PROFILE_FONTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!FILE_NAME_PATTERN.test(entry.name)) {
      if (!entry.name.startsWith('.') && entry.name.toLowerCase() !== 'readme.md') {
        logger.warn({ file: entry.name }, 'Шрифт визитки пропущен: годятся только .woff2 с именем из латиницы');
      }
      continue;
    }
    const face = parseFace(entry.name);
    if (!face) {
      logger.warn({ file: entry.name }, 'Шрифт визитки пропущен: имя семейства не годится для CSS');
      continue;
    }
    faces.push(face);
  }

  return {
    faces,
    css: buildCss(faces),
    families: buildFamilies(faces),
    files: new Set(faces.map((face) => face.file)),
  };
}

export function initProfileFonts(): void {
  table = scan();
  logger.info({ families: table.families.length, faces: table.faces.length }, 'Шрифты визитки просканированы');
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
  return ensureTable().files.has(fileName) ? path.join(PROFILE_FONTS_DIR, fileName) : null;
}
