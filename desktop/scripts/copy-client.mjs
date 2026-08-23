import { cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..', '..', 'client', 'dist');
const target = path.resolve(here, '..', 'renderer');

const built = await stat(source).catch(() => null);

if (!built?.isDirectory()) {
  console.error(`Сборки клиента нет: ${source}\nСначала выполните: npm run desktop:client`);
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });

console.log(`Клиент скопирован в ${target}`);
