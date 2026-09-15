import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { APP_RELEASE_WINDOWS_MANIFEST_FILE, WINDOWS_RELEASE_BASE_PATH } from '@messenger/shared';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { resetWindowsReleaseCache } from '../src/services/appRelease.js';

const request = supertest(createApp());

const EXE_BODY = Buffer.from('MZ не настоящий exe, но байты те же самые');
const EXE_SHA256 = createHash('sha256').update(EXE_BODY).digest('hex');
const EXE_FILE = 'Qwill-Setup-test.exe';

const windowsDir = path.join(env.appReleaseDir, 'windows');
const manifestFile = path.join(env.appReleaseDir, APP_RELEASE_WINDOWS_MANIFEST_FILE);
const exeFile = path.join(windowsDir, EXE_FILE);

let hadManifest = false;
let previousManifest: Buffer | null = null;

async function writeManifest(manifest: Record<string, unknown>): Promise<void> {
  resetWindowsReleaseCache();
  await fs.writeFile(manifestFile, JSON.stringify(manifest), 'utf8');
}

async function removeManifest(): Promise<void> {
  resetWindowsReleaseCache();
  await fs.rm(manifestFile, { force: true });
}

beforeAll(async () => {
  await fs.mkdir(windowsDir, { recursive: true });
  previousManifest = await fs.readFile(manifestFile).catch(() => null);
  hadManifest = previousManifest !== null;
  await fs.writeFile(exeFile, EXE_BODY);
});

afterEach(async () => {
  await removeManifest();
});

afterAll(async () => {
  await fs.rm(exeFile, { force: true });
  resetWindowsReleaseCache();
  if (hadManifest && previousManifest) {
    await fs.writeFile(manifestFile, previousManifest);
  } else {
    await fs.rm(manifestFile, { force: true });
  }
});

const VALID_MANIFEST = {
  versionName: '1.0.0',
  exeFile: EXE_FILE,
  sha256: EXE_SHA256,
  changelog: ['Первый выпуск десктопного приложения'],
};

describe('GET /api/app/win/version', () => {
  it('отдаёт ровно оговорённый набор полей и ничего сверх него', async () => {
    await writeManifest(VALID_MANIFEST);

    const res = await request.get('/api/app/win/version');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['changelog', 'exeUrl', 'sha256', 'sizeBytes', 'versionName'].sort());
    expect(res.body).toMatchObject({
      versionName: '1.0.0',
      exeUrl: `${WINDOWS_RELEASE_BASE_PATH}/${EXE_FILE}`,
      sizeBytes: EXE_BODY.length,
      sha256: EXE_SHA256,
      changelog: ['Первый выпуск десктопного приложения'],
    });
  });

  it('отдаёт заголовок no-store', async () => {
    await writeManifest(VALID_MANIFEST);

    const res = await request.get('/api/app/win/version');

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('работает без авторизации', async () => {
    await writeManifest(VALID_MANIFEST);

    const res = await request.get('/api/app/win/version');

    expect(res.status).toBe(200);
  });

  it('отвечает 404, пока выпуск не опубликован', async () => {
    const res = await request.get('/api/app/win/version');

    expect(res.status).toBe(404);
  });

  it('отвечает 404 на повреждённый манифест, а не отдаёт половину полей', async () => {
    await writeManifest({ ...VALID_MANIFEST, sha256: 'слишком короткий' });

    const res = await request.get('/api/app/win/version');

    expect(res.status).toBe(404);
  });

  it('отвечает 404, если манифест ссылается на отсутствующий .exe', async () => {
    await writeManifest({ ...VALID_MANIFEST, exeFile: 'Qwill-Setup-missing.exe' });

    const res = await request.get('/api/app/win/version');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/app/win/*', () => {
  it('раздаёт .exe целиком со заголовком no-store', async () => {
    const res = await request.get(`/api/app/win/${EXE_FILE}`).responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Buffer.from(res.body as Buffer)).toEqual(EXE_BODY);
  });

  it('отдаёт запрошенный кусок по Range', async () => {
    const res = await request.get(`/api/app/win/${EXE_FILE}`).set('Range', 'bytes=2-5').responseType('blob');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 2-5/${EXE_BODY.length}`);
    expect(Buffer.from(res.body as Buffer)).toEqual(EXE_BODY.subarray(2, 6));
  });

  it('отвечает 404 на отсутствующий файл', async () => {
    const res = await request.get('/api/app/win/does-not-exist.exe');

    expect(res.status).toBe(404);
  });
});

describe('Android-маршруты не задеты', () => {
  it('/api/app/version по-прежнему отвечает', async () => {
    const res = await request.get('/api/app/version');

    expect([200, 404]).toContain(res.status);
  });
});
