import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..');
const clientDist = path.join(repoRoot, 'client', 'dist');
const rendererDir = path.join(desktopDir, 'renderer');
const apiConfigFile = path.join(desktopDir, 'api-origin.json');
const devUpdateConfigFile = path.join(desktopDir, 'dev-app-update.yml');
const UPDATER_CACHE_DIR_NAME = 'qwill-updater';

const MKCERT_DIR = path.join(homedir(), '.vite-plugin-mkcert');

function devServerUsesHttps() {
  return existsSync(path.join(MKCERT_DIR, 'dev.pem')) && existsSync(path.join(MKCERT_DIR, 'cert.pem'));
}

function resolveApiUrl() {
  if (process.env.QWILL_API_URL) return process.env.QWILL_API_URL;
  return `${devServerUsesHttps() ? 'https' : 'http'}://localhost:3000`;
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true, env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const apiUrl = resolveApiUrl();
console.log(`API для десктопной сборки: ${apiUrl}`);

run('npm', ['run', 'build', '-w', '@messenger/client'], repoRoot, {
  ...process.env,
  NODE_ENV: 'production',
  VITE_API_URL: apiUrl,
});

const built = await stat(clientDist).catch(() => null);
if (!built?.isDirectory()) {
  console.error(`Сборка клиента не появилась: ${clientDist}`);
  process.exit(1);
}

await rm(rendererDir, { recursive: true, force: true });
await mkdir(path.dirname(rendererDir), { recursive: true });
await cp(clientDist, rendererDir, { recursive: true });
await writeFile(apiConfigFile, `${JSON.stringify({ apiUrl }, null, 2)}\n`, 'utf8');
await writeFile(
  devUpdateConfigFile,
  ['provider: generic', `url: ${apiUrl}/api/app/win`, `updaterCacheDirName: ${UPDATER_CACHE_DIR_NAME}`, ''].join('\n'),
  'utf8',
);

run('npm', ['run', 'build', '-w', '@messenger/desktop'], repoRoot, process.env);

console.log(`Клиент скопирован в ${rendererDir}`);
