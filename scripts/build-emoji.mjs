import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const require = createRequire(import.meta.url);

const CELL = 64;
const COLS = 32;

const CATEGORY_LABELS = {
  'Smileys & People': 'Смайлы и люди',
  'Smileys & Emotion': 'Смайлы и люди',
  'People & Body': 'Смайлы и люди',
  'Animals & Nature': 'Животные',
  'Food & Drink': 'Еда',
  Activities: 'Активность',
  Activity: 'Активность',
  'Travel & Places': 'Путешествия',
  Objects: 'Объекты',
  Symbols: 'Символы',
  Flags: 'Флаги',
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptDir, '..', 'client', 'public', 'emoji');
const synonymsPath = path.join(scriptDir, 'emoji-synonyms.json');
const replicaStripListPath = path.join(
  scriptDir,
  '..',
  'client',
  'src',
  'pages',
  'download',
  'demo',
  'replica',
  'phone',
  'replicaEmoji.json',
);
const replicaStripOutDir = path.join(scriptDir, '..', 'client', 'public', 'download');

function resolvePackageRoot() {
  const packageJsonPath = require.resolve('emoji-datasource-apple/package.json');
  return path.dirname(packageJsonPath);
}

function codepointsToChar(unified) {
  const codepoints = unified.split('-').map((hex) => Number.parseInt(hex, 16));
  return String.fromCodePoint(...codepoints);
}

function normalizeHexcode(hexcode) {
  return hexcode
    .split('-')
    .filter((cp) => cp.toUpperCase() !== 'FE0F')
    .join('-')
    .toUpperCase();
}

async function loadRussianKeywords() {
  const russianDataPath = require.resolve('emojibase-data/ru/data.json');
  const raw = JSON.parse(await readFile(russianDataPath, 'utf8'));

  const map = new Map();
  function addRecord(record) {
    const words = [record.label, ...(record.tags ?? [])]
      .filter((v) => typeof v === 'string' && v.length > 0)
      .map((v) => v.toLowerCase());
    map.set(normalizeHexcode(record.hexcode), words);
    if (Array.isArray(record.skins)) record.skins.forEach(addRecord);
  }
  raw.forEach(addRecord);
  return map;
}

async function loadSynonyms() {
  const raw = JSON.parse(await readFile(synonymsPath, 'utf8'));
  return new Map(Object.entries(raw));
}

async function buildReplicaStrip(imageDir, charToUnified) {
  const list = JSON.parse(await readFile(replicaStripListPath, 'utf8'));
  const strip = [...new Set([...list.quick, list.reaction])];

  const composites = strip.map((char, i) => {
    const unified = charToUnified.get(char);
    if (!unified) throw new Error(`Нет картинки для эмодзи страницы загрузки: ${char}`);
    return { input: path.join(imageDir, `${unified.toLowerCase()}.png`), left: i * CELL, top: 0 };
  });

  await mkdir(replicaStripOutDir, { recursive: true });

  await sharp({
    create: { width: strip.length * CELL, height: CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .webp({ quality: 92 })
    .toFile(path.join(replicaStripOutDir, 'emoji.webp'));

  console.log(`Лента эмодзи страницы загрузки: ${strip.length} шт. → ${replicaStripOutDir}`);
}

async function main() {
  const packageRoot = resolvePackageRoot();
  const emojiJsonPath = path.join(packageRoot, 'emoji.json');
  const imageDir = path.join(packageRoot, 'img', 'apple', String(CELL));

  const raw = JSON.parse(await readFile(emojiJsonPath, 'utf8'));
  const russianKeywords = await loadRussianKeywords();
  const synonyms = await loadSynonyms();

  let missingRussian = 0;

  const entries = raw
    .filter((record) => record.has_img_apple && !record.obsoleted_by && record.category !== 'Component')
    .map((record) => {
      const key = normalizeHexcode(record.unified);
      const russian = russianKeywords.get(key);
      if (!russian) missingRussian += 1;

      const keywords = Array.from(
        new Set(
          [
            record.short_name,
            ...(record.short_names ?? []),
            record.name,
            ...(russian ?? []),
            ...(synonyms.get(key) ?? []),
          ]
            .filter((v) => typeof v === 'string' && v.length > 0)
            .map((v) => v.toLowerCase()),
        ),
      );

      return {
        unified: record.unified,
        category: record.category,
        sortOrder: record.sort_order,
        keywords,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (entries.length === 0) {
    throw new Error('emoji.json не дал ни одной записи с has_img_apple — проверь версию emoji-datasource-apple');
  }

  console.log(`Без русских слов осталось: ${missingRussian} из ${entries.length}`);

  const rows = Math.ceil(entries.length / COLS);
  const categoryOrder = [];
  const categoryIndex = new Map();
  const composites = [];
  const indexEmoji = [];

  entries.forEach((entry, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    composites.push({ input: path.join(imageDir, `${entry.unified.toLowerCase()}.png`), left: col * CELL, top: row * CELL });

    const categoryLabel = CATEGORY_LABELS[entry.category] ?? entry.category ?? 'Прочее';
    if (!categoryIndex.has(categoryLabel)) {
      categoryIndex.set(categoryLabel, categoryOrder.length);
      categoryOrder.push(categoryLabel);
    }

    indexEmoji.push({
      e: codepointsToChar(entry.unified),
      x: col,
      y: row,
      c: categoryIndex.get(categoryLabel),
      k: entry.keywords,
    });
  });

  await mkdir(outDir, { recursive: true });

  await sharp({
    create: { width: COLS * CELL, height: rows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .webp({ quality: 92 })
    .toFile(path.join(outDir, 'sheet.webp'));

  const index = { cell: CELL, cols: COLS, rows, categories: categoryOrder, emoji: indexEmoji };
  await writeFile(path.join(outDir, 'index.json'), JSON.stringify(index));

  await buildReplicaStrip(
    imageDir,
    new Map(entries.map((entry) => [codepointsToChar(entry.unified), entry.unified])),
  );

  console.log(`Готово: ${entries.length} эмодзи, лист ${COLS}×${rows} ячеек по ${CELL}px → ${outDir}`);
}

main().catch((error) => {
  console.error('Сборка эмодзи не удалась:', error);
  console.error('Проверь, что npm install подтянул emoji-datasource-apple, и что структура');
  console.error('img/apple/64/*.png и emoji.json в пакете совпадает с той, на которую рассчитан скрипт.');
  process.exitCode = 1;
});
