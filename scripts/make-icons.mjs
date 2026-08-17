import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(repoRoot, 'qwill.png');

const WEB_ICONS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

const ANDROID_DENSITIES = [
  { density: 'mdpi', launcher: 48, foreground: 108 },
  { density: 'hdpi', launcher: 72, foreground: 162 },
  { density: 'xhdpi', launcher: 96, foreground: 216 },
  { density: 'xxhdpi', launcher: 144, foreground: 324 },
  { density: 'xxxhdpi', launcher: 192, foreground: 432 },
];

const webDir = path.join(repoRoot, 'client', 'public');
const androidResDir = path.join(repoRoot, 'client', 'android', 'app', 'src', 'main', 'res');

function square(size) {
  return sharp(SOURCE).resize(size, size, { fit: 'cover' }).png();
}

function circleMask(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`,
  );
}

async function writeSquare(target, size) {
  await writeFile(target, await square(size).toBuffer());
}

async function writeCircle(target, size) {
  const base = await square(size).ensureAlpha().toBuffer();
  const masked = await sharp(base)
    .composite([{ input: circleMask(size), blend: 'dest-in' }])
    .png()
    .toBuffer();
  await writeFile(target, masked);
}

async function main() {
  const meta = await sharp(SOURCE).metadata();
  if (meta.width !== meta.height) {
    console.error(`${SOURCE}: ожидался квадрат, получено ${meta.width}x${meta.height}`);
    process.exit(1);
  }

  for (const { file, size } of WEB_ICONS) {
    await writeSquare(path.join(webDir, file), size);
    console.log(`client/public/${file} — ${size}x${size}`);
  }

  for (const { density, launcher, foreground } of ANDROID_DENSITIES) {
    const dir = path.join(androidResDir, `mipmap-${density}`);
    await mkdir(dir, { recursive: true });

    await writeSquare(path.join(dir, 'ic_launcher.png'), launcher);
    await writeCircle(path.join(dir, 'ic_launcher_round.png'), launcher);
    await writeSquare(path.join(dir, 'ic_launcher_foreground.png'), foreground);
    console.log(`mipmap-${density} — ${launcher}px значок, ${foreground}px слой адаптивной иконки`);
  }
}

await main();
