import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apkSource = path.join(repoRoot, 'client/android/app/build/outputs/apk/prod/release/app-prod-release.apk');
const versionFile = path.join(repoRoot, 'client/android/version.properties');
const outDir = path.join(repoRoot, 'app-releases');

function readProperties(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

const apk = await fs.readFile(apkSource).catch(() => {
  throw new Error(`APK не найден: ${apkSource}\nСоберите его: npm run android:release -w @messenger/client`);
});

const version = readProperties(await fs.readFile(versionFile, 'utf8'));
const latestVersionCode = Number(version.versionCode);
const versionName = version.versionName;

const previous = await fs
  .readFile(path.join(outDir, 'android.json'), 'utf8')
  .then((text) => JSON.parse(text))
  .catch(() => null);

const minSupportedVersionCode = Number(
  process.env.MIN_SUPPORTED_VERSION_CODE ?? previous?.minSupportedVersionCode ?? 1,
);

const changelog = process.argv.slice(2).filter(Boolean);

const apkFile = `qwill-${versionName}.apk`;

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, apkFile), apk);
await fs.writeFile(
  path.join(outDir, 'android.json'),
  `${JSON.stringify(
    {
      latestVersionCode,
      versionName,
      minSupportedVersionCode,
      apkFile,
      sha256: createHash('sha256').update(apk).digest('hex'),
      changelog,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`app-releases/${apkFile} и app-releases/android.json готовы`);
console.log(`versionCode=${latestVersionCode} versionName=${versionName} minSupported=${minSupportedVersionCode}`);
if (changelog.length === 0) {
  console.log('Список изменений пуст — передайте пункты аргументами: npm run release:manifest -- "Пункт 1" "Пункт 2"');
}
