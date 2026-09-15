import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveApiUrl } from './apiUrl.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..');
const outputDir = path.join(desktopDir, 'dist-release');
const releaseDir = path.join(repoRoot, 'app-releases', 'windows');
const envFile = path.join(repoRoot, '.env');

const SIGNING_KEYS = ['CSC_LINK', 'CSC_KEY_PASSWORD'];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true, env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function loadSigningEnv() {
  const text = await readFile(envFile, 'utf8').catch(() => null);
  if (!text) return;

  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(line);
    if (!match || !SIGNING_KEYS.includes(match[1])) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }

  const link = process.env.CSC_LINK;
  if (link && !path.isAbsolute(link) && !/^https?:/.test(link)) {
    process.env.CSC_LINK = path.resolve(repoRoot, link);
  }
}

async function readVersion() {
  const manifest = JSON.parse(await readFile(path.join(desktopDir, 'package.json'), 'utf8'));
  return manifest.version;
}

async function readElectronVersion() {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8'),
  );
  return manifest.version;
}

async function copyArtifacts(version) {
  await mkdir(releaseDir, { recursive: true });

  const wanted = [`Qwill-Setup-${version}.exe`, `Qwill-Setup-${version}.exe.blockmap`, 'latest.yml'];
  const present = new Set(await readdir(outputDir));
  const missing = wanted.filter((name) => !present.has(name));
  if (missing.length > 0) {
    console.error(`electron-builder не создал: ${missing.join(', ')}`);
    process.exit(1);
  }

  for (const name of wanted) {
    await copyFile(path.join(outputDir, name), path.join(releaseDir, name));
  }

  const exePath = path.join(releaseDir, `Qwill-Setup-${version}.exe`);
  const exe = await readFile(exePath);
  const size = (await stat(exePath)).size;
  return { sha256: createHash('sha256').update(exe).digest('hex'), size };
}

await loadSigningEnv();

const apiUrl = resolveApiUrl();
const version = await readVersion();
const electronVersion = await readElectronVersion();
const signed = Boolean(process.env.CSC_LINK);

console.log(
  `Сборка Qwill ${version} · Electron ${electronVersion} · API ${apiUrl} · подпись ${signed ? 'есть' : 'нет'}`,
);

run('node', [path.join(here, 'build.mjs')], repoRoot);
run(
  'npx',
  [
    'electron-builder',
    '--win',
    '--publish',
    'never',
    `-c.electronVersion=${electronVersion}`,
    `-c.publish.url=${apiUrl}/api/app/win`,
  ],
  desktopDir,
);

const { sha256, size } = await copyArtifacts(version);

console.log('');
console.log(`app-releases/windows/Qwill-Setup-${version}.exe — ${(size / 1024 / 1024).toFixed(1)} МБ`);
console.log(`sha256 ${sha256}`);
console.log(`Манифест: npm run release:manifest:win -- "Первый пункт" "Второй пункт"`);
