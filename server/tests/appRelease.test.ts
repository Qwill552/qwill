import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { APP_RELEASE_MANIFEST_FILE } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { resetAppReleaseCache } from '../src/services/appRelease.js';

const request = supertest(createApp());

const APK_BODY = Buffer.from('PK не настоящий apk, но байты те же самые');
const APK_SHA256 = createHash('sha256').update(APK_BODY).digest('hex');
const APK_FILE = 'qwill-test.apk';

const manifestFile = path.join(env.appReleaseDir, APP_RELEASE_MANIFEST_FILE);
const apkFile = path.join(env.appReleaseDir, APK_FILE);

let hadManifest = false;
let previousManifest: Buffer | null = null;

async function writeManifest(manifest: Record<string, unknown>): Promise<void> {
  resetAppReleaseCache();
  await fs.writeFile(manifestFile, JSON.stringify(manifest), 'utf8');
}

async function removeManifest(): Promise<void> {
  resetAppReleaseCache();
  await fs.rm(manifestFile, { force: true });
}

beforeAll(async () => {
  await fs.mkdir(env.appReleaseDir, { recursive: true });
  previousManifest = await fs.readFile(manifestFile).catch(() => null);
  hadManifest = previousManifest !== null;
  await fs.writeFile(apkFile, APK_BODY);
});

afterEach(async () => {
  await removeManifest();
});

afterAll(async () => {
  await fs.rm(apkFile, { force: true });
  resetAppReleaseCache();
  if (hadManifest && previousManifest) {
    await fs.writeFile(manifestFile, previousManifest);
  } else {
    await fs.rm(manifestFile, { force: true });
  }
});

const VALID_MANIFEST = {
  latestVersionCode: 7,
  versionName: '1.3.0',
  minSupportedVersionCode: 3,
  apkFile: APK_FILE,
  sha256: APK_SHA256,
  changelog: ['Обновление одной кнопкой', 'Починены уведомления'],
};

describe('GET /api/app/version', () => {
  it('отдаёт ровно оговорённый набор полей и ничего сверх него', async () => {
    await writeManifest(VALID_MANIFEST);

    const res = await request.get('/api/app/version');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['apkUrl', 'changelog', 'latestVersionCode', 'minSupportedVersionCode', 'sha256', 'sizeBytes', 'versionName'].sort(),
    );
    expect(res.body).toMatchObject({
      latestVersionCode: 7,
      versionName: '1.3.0',
      minSupportedVersionCode: 3,
      apkUrl: '/api/app/apk',
      sizeBytes: APK_BODY.length,
      sha256: APK_SHA256,
      changelog: ['Обновление одной кнопкой', 'Починены уведомления'],
    });
  });

  it('не раскрывает путь к файлу на диске', async () => {
    await writeManifest(VALID_MANIFEST);

    const res = await request.get('/api/app/version');

    expect(JSON.stringify(res.body)).not.toContain(APK_FILE);
    expect(JSON.stringify(res.body)).not.toContain(env.appReleaseDir);
  });

  it('работает без авторизации', async () => {
    await writeManifest(VALID_MANIFEST);

    const res = await request.get('/api/app/version');

    expect(res.status).toBe(200);
  });

  it('отвечает 404, пока выпуск не опубликован', async () => {
    const res = await request.get('/api/app/version');

    expect(res.status).toBe(404);
  });

  it('отвечает 404 на повреждённый манифест, а не отдаёт половину полей', async () => {
    await writeManifest({ ...VALID_MANIFEST, sha256: 'слишком короткий' });

    const res = await request.get('/api/app/version');

    expect(res.status).toBe(404);
  });

  it('отвечает 404, если манифест ссылается на отсутствующий APK', async () => {
    await writeManifest({ ...VALID_MANIFEST, apkFile: 'qwill-missing.apk' });

    const res = await request.get('/api/app/version');

    expect(res.status).toBe(404);
  });

  it('не выпускает apkFile за пределы каталога выпусков', async () => {
    await writeManifest({ ...VALID_MANIFEST, apkFile: '../../.env' });

    const res = await request.get('/api/app/version');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/app/apk', () => {
  it('отдаёт файл целиком и разрешает докачку', async () => {
    await writeManifest(VALID_MANIFEST);

    const res = await request.get('/api/app/apk').responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-type']).toContain('application/vnd.android.package-archive');
    expect(res.headers['content-disposition']).toContain('qwill-1.3.0.apk');
    expect(Buffer.from(res.body as Buffer)).toEqual(APK_BODY);
  });

  it('отдаёт запрошенный кусок по Range', async () => {
    await writeManifest(VALID_MANIFEST);

    const res = await request.get('/api/app/apk').set('Range', 'bytes=2-5').responseType('blob');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 2-5/${APK_BODY.length}`);
    expect(Buffer.from(res.body as Buffer)).toEqual(APK_BODY.subarray(2, 6));
  });

  it('отклоняет Range за пределами файла', async () => {
    await writeManifest(VALID_MANIFEST);

    const res = await request.get('/api/app/apk').set('Range', `bytes=0-${APK_BODY.length + 100}`);

    expect(res.status).toBe(416);
  });

  it('отвечает 404, пока выпуск не опубликован', async () => {
    const res = await request.get('/api/app/apk');

    expect(res.status).toBe(404);
  });
});
