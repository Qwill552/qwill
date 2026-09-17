import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..');
const brandDir = path.join(repoRoot, 'brand');
const buildDir = path.join(desktopDir, 'build');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const HEADER_BYTES = 6;
const DIRECTORY_ENTRY_BYTES = 16;
const MAX_BYTE_SIZE = 256;

const TARGETS = [
  {
    source: 'qwill-no-background.png',
    file: 'icon.ico',
    what: 'exe, ярлык, меню Пуск, панель задач, окно, трей',
  },
  { source: 'qwill.png', file: 'installer.ico', what: 'установщик' },
];

async function renderLayers(sourceFile) {
  return Promise.all(
    ICO_SIZES.map(async (size) => ({
      size,
      body: await sharp(sourceFile)
        .resize(size, size, { fit: 'cover' })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    })),
  );
}

function icoContainer(layers) {
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(layers.length, 4);

  const directory = Buffer.alloc(DIRECTORY_ENTRY_BYTES * layers.length);
  let offset = HEADER_BYTES + directory.length;

  layers.forEach((layer, index) => {
    const at = index * DIRECTORY_ENTRY_BYTES;
    const dimension = layer.size === MAX_BYTE_SIZE ? 0 : layer.size;
    directory.writeUInt8(dimension, at);
    directory.writeUInt8(dimension, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(layer.body.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += layer.body.length;
  });

  return Buffer.concat([header, directory, ...layers.map((layer) => layer.body)]);
}

export async function makeDesktopIcons() {
  await mkdir(buildDir, { recursive: true });

  for (const { source, file, what } of TARGETS) {
    const layers = await renderLayers(path.join(brandDir, source));
    await writeFile(path.join(buildDir, file), icoContainer(layers));
    console.log(`desktop/build/${file} — ${ICO_SIZES.join('/')} из brand/${source} (${what})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await makeDesktopIcons();
}
