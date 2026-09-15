import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopManifest = path.join(repoRoot, 'desktop/package.json');
const outDir = path.join(repoRoot, 'app-releases');
const windowsDir = path.join(outDir, 'windows');

const { version } = JSON.parse(await fs.readFile(desktopManifest, 'utf8'));
const exeFile = `Qwill-Setup-${version}.exe`;
const exePath = path.join(windowsDir, exeFile);

const exe = await fs.readFile(exePath).catch(() => {
  throw new Error(`Установщик не найден: ${exePath}\nСоберите его: npm run desktop:dist`);
});

const changelog = process.argv.slice(2).filter(Boolean);

await fs.writeFile(
  path.join(outDir, 'windows.json'),
  `${JSON.stringify(
    {
      versionName: version,
      exeFile,
      sha256: createHash('sha256').update(exe).digest('hex'),
      changelog,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`app-releases/windows.json готов — версия ${version}, ${exeFile}`);
if (changelog.length === 0) {
  console.log('Список изменений пуст — передайте пункты аргументами: npm run release:manifest:win -- "Пункт 1" "Пункт 2"');
}
