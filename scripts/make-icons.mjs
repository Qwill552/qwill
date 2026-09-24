import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND_DIR = path.join(repoRoot, 'brand');
const WEB_SOURCE = path.join(BRAND_DIR, 'qwill.png');
const ANDROID_SOURCE = path.join(BRAND_DIR, 'qwill-android.png');
const FAVICON_DARK_SOURCE = path.join(BRAND_DIR, 'qwill-no-background.png');

const WEB_ICONS = [
  { file: 'icon-192.png', size: 192, source: WEB_SOURCE },
  { file: 'icon-512.png', size: 512, source: WEB_SOURCE },
];

const FAVICONS = [
  { file: 'favicon-light.png', size: 32, source: WEB_SOURCE },
  { file: 'favicon-dark.png', size: 32, source: FAVICON_DARK_SOURCE },
  { file: 'apple-touch-icon.png', size: 180, source: WEB_SOURCE },
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
const DEV_HUE = 150;
const devResDir = path.join(repoRoot, 'client', 'android', 'app', 'src', 'dev', 'res');
const NATIVE_HUE = 210;
const nativeResDir = path.join(repoRoot, 'android', 'app', 'src', 'main', 'res');
const nativeNatResDir = path.join(repoRoot, 'android', 'app', 'src', 'nat', 'res');

function square(source, size, hue) {
  const base = sharp(source).resize(size, size, { fit: 'cover' });
  return (hue ? base.modulate({ hue }) : base).png();
}

function circleMask(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`,
  );
}

async function writeSquare(source, target, size, hue) {
  await writeFile(target, await square(source, size, hue).toBuffer());
}

async function writeCircle(source, target, size, hue) {
  const base = await square(source, size, hue).ensureAlpha().toBuffer();
  const masked = await sharp(base)
    .composite([{ input: circleMask(size), blend: 'dest-in' }])
    .png()
    .toBuffer();
  await writeFile(target, masked);
}

async function writeAndroidIcons(resDir, hue) {
  for (const { density, launcher, foreground } of ANDROID_DENSITIES) {
    const dir = path.join(resDir, `mipmap-${density}`);
    await mkdir(dir, { recursive: true });

    await writeSquare(ANDROID_SOURCE, path.join(dir, 'ic_launcher.png'), launcher, hue);
    await writeCircle(ANDROID_SOURCE, path.join(dir, 'ic_launcher_round.png'), launcher, hue);
    await writeSquare(ANDROID_SOURCE, path.join(dir, 'ic_launcher_foreground.png'), foreground, hue);
    console.log(`${path.basename(path.dirname(resDir))} mipmap-${density} — ${launcher}px значок, ${foreground}px слой адаптивной иконки`);
  }
}

async function assertSquare(source) {
  const meta = await sharp(source).metadata();
  if (meta.width !== meta.height) {
    console.error(`${source}: ожидался квадрат, получено ${meta.width}x${meta.height}`);
    process.exit(1);
  }
}

async function main() {
  await assertSquare(WEB_SOURCE);
  await assertSquare(ANDROID_SOURCE);
  await assertSquare(FAVICON_DARK_SOURCE);

  for (const { file, size, source } of [...WEB_ICONS, ...FAVICONS]) {
    await writeSquare(source, path.join(webDir, file), size);
    console.log(`client/public/${file} — ${size}x${size}`);
  }

  await writeAndroidIcons(androidResDir);
  await writeAndroidIcons(devResDir, DEV_HUE);
  await writeAndroidIcons(nativeResDir);
  await writeAndroidIcons(nativeNatResDir, NATIVE_HUE);
}

await main();
