import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

import yazl from 'yazl';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopManifest = path.join(repoRoot, 'desktop/package.json');
const certificate = path.join(repoRoot, 'desktop/qwill-code-signing.cer');
const installerKit = path.join(repoRoot, 'desktop/installer-kit');
const outDir = path.join(repoRoot, 'app-releases');
const windowsDir = path.join(outDir, 'windows');

const OEM_CYRILLIC = 'ibm866';

function oemEncoder() {
  const decoder = new TextDecoder(OEM_CYRILLIC);
  const byteOf = new Map();
  for (let byte = 0; byte < 256; byte += 1) {
    byteOf.set(decoder.decode(Uint8Array.of(byte)), byte);
  }
  return (text) => {
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
      const byte = byteOf.get(text[index]);
      if (byte === undefined) throw new Error(`Символ «${text[index]}» не существует в ${OEM_CYRILLIC}`);
      bytes[index] = byte;
    }
    return Buffer.from(bytes);
  };
}

const args = process.argv.slice(2);
const skipZip = args.includes('--no-zip');
const changelog = args.filter((value) => value && value !== '--no-zip');

const { version } = JSON.parse(await fs.readFile(desktopManifest, 'utf8'));
const exeFile = `Qwill-Setup-${version}.exe`;
const exePath = path.join(windowsDir, exeFile);

const exe = await fs.readFile(exePath).catch(() => {
  throw new Error(`Установщик не найден: ${exePath}\nСоберите его: npm run desktop:dist`);
});

async function packInstallerKit() {
  const certificateExists = await fs
    .access(certificate)
    .then(() => true)
    .catch(() => false);

  if (!certificateExists) {
    throw new Error(
      `Не найден сертификат: ${certificate}\n` +
        'Без него в архив нечего класть: .bat нужен именно для него.\n' +
        'Собрать выпуск без архива: npm run release:manifest:win -- --no-zip "Пункт 1"',
    );
  }

  const kit = await fs.readdir(installerKit);
  const zipFile = `Qwill-Setup-${version}.zip`;
  const zipPath = path.join(windowsDir, zipFile);

  const toOem = oemEncoder();

  const zip = new yazl.ZipFile();
  zip.addFile(exePath, exeFile);
  zip.addFile(certificate, path.basename(certificate));
  for (const name of kit) {
    const source = path.join(installerKit, name);
    if (name.toLowerCase().endsWith('.bat')) {
      zip.addBuffer(toOem((await fs.readFile(source, 'utf8')).replace(/\r?\n/g, '\r\n')), name);
    } else {
      zip.addFile(source, name);
    }
  }
  zip.end();

  await new Promise((resolve, reject) => {
    const target = createWriteStream(zipPath);
    target.on('close', resolve);
    target.on('error', reject);
    zip.outputStream.on('error', reject);
    zip.outputStream.pipe(target);
  });

  const { size } = await fs.stat(zipPath);
  return { zipFile, size, entries: [exeFile, path.basename(certificate), ...kit] };
}

const archive = skipZip ? null : await packInstallerKit();

await fs.writeFile(
  path.join(outDir, 'windows.json'),
  `${JSON.stringify(
    {
      versionName: version,
      exeFile,
      ...(archive ? { zipFile: archive.zipFile } : {}),
      sha256: createHash('sha256').update(exe).digest('hex'),
      changelog,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`app-releases/windows.json готов — версия ${version}, ${exeFile}`);
if (archive) {
  console.log(`app-releases/windows/${archive.zipFile} — ${(archive.size / 1024 / 1024).toFixed(1)} МБ`);
  console.log(`  внутри: ${archive.entries.join(', ')}`);
} else {
  console.log('Архив не собран (--no-zip): с сайта будет качаться голый .exe');
}
if (changelog.length === 0) {
  console.log('Список изменений пуст — передайте пункты аргументами: npm run release:manifest:win -- "Пункт 1" "Пункт 2"');
}
