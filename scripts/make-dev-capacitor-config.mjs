import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repoRoot, 'client/android/app/src/main/assets/capacitor.config.json');
const targetDir = path.join(repoRoot, 'client/android/app/src/dev/assets');

const config = JSON.parse(await readFile(source, 'utf8'));

config.appId = 'com.qwill.app.dev';
config.appName = 'Qwill Dev';
config.server = { ...config.server, url: 'https://dev.qwill.mooo.com' };
config.android = { ...config.android, webContentsDebuggingEnabled: true };

await mkdir(targetDir, { recursive: true });
await writeFile(path.join(targetDir, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');

console.log(`dev-конфиг обновлён: ${config.server.url}`);
