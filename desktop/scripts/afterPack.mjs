import { rm, stat } from 'node:fs/promises';
import path from 'node:path';

const DROPPED = ['dxcompiler.dll', 'dxil.dll'];

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  let freed = 0;
  for (const name of DROPPED) {
    const file = path.join(context.appOutDir, name);
    const size = await stat(file).then((info) => info.size, () => 0);
    if (size === 0) continue;
    await rm(file, { force: true });
    freed += size;
  }

  if (freed > 0) {
    console.log(`Убран компилятор шейдеров WebGPU: ${(freed / 1024 / 1024).toFixed(1)} МБ`);
  }
}
