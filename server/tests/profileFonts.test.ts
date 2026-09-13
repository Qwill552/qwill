import fs from 'node:fs/promises';
import path from 'node:path';

import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CURRENT_LEGAL_VERSIONS } from '../src/config/legal.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import {
  initProfileFonts,
  PROFILE_FONTS_DIR,
  PROFILE_FONTS_PERSISTENT_DIR,
  resolveProfileFontPath,
} from '../src/lib/profileFonts.js';

const app = createApp();
const request = supertest(app);

const FILES = ['QwillTest.woff2', 'QwillTest-Bold.woff2', 'QwillTest-BoldItalic.woff2', 'QwillTest-Wide.woff2'];
const IGNORED = 'QwillTest-Bold.ttf';
const PERSISTENT = 'QwillPersist-Bold.woff2';

describe('шрифты визитки (R-30C)', () => {
  beforeAll(async () => {
    await fs.mkdir(PROFILE_FONTS_DIR, { recursive: true });
    for (const file of [...FILES, IGNORED]) {
      await fs.writeFile(path.join(PROFILE_FONTS_DIR, file), Buffer.from('wOF2 заглушка'));
    }
    await fs.mkdir(PROFILE_FONTS_PERSISTENT_DIR, { recursive: true });
    await fs.writeFile(path.join(PROFILE_FONTS_PERSISTENT_DIR, PERSISTENT), Buffer.from('wOF2 постоянная'));
    await fs.writeFile(path.join(PROFILE_FONTS_PERSISTENT_DIR, FILES[0]!), Buffer.from('wOF2 перекрытая'));
    initProfileFonts();
  });

  afterAll(async () => {
    for (const file of [...FILES, IGNORED]) {
      await fs.unlink(path.join(PROFILE_FONTS_DIR, file)).catch(() => undefined);
    }
    await fs.unlink(path.join(PROFILE_FONTS_PERSISTENT_DIR, PERSISTENT)).catch(() => undefined);
    await fs.unlink(path.join(PROFILE_FONTS_PERSISTENT_DIR, FILES[0]!)).catch(() => undefined);
    initProfileFonts();
    await prisma.$disconnect();
  });

  it('семейство появляется в списке без правки кода, начертания собираются в одно', async () => {
    const res = await request.get('/api/card-fonts');

    expect(res.status).toBe(200);
    const found = (res.body as { family: string; weights: number[]; hasItalic: boolean }[]).find(
      (font) => font.family === 'QwillTest',
    );
    expect(found).toBeDefined();
    expect(found?.weights).toEqual([400, 700]);
    expect(found?.hasItalic).toBe(true);
  });

  it('нераспознанный суффикс даёт отдельное семейство с полным именем', async () => {
    const res = await request.get('/api/card-fonts');
    const families = (res.body as { family: string }[]).map((font) => font.family);
    expect(families).toContain('QwillTest-Wide');
  });

  it('блок @font-face вставляется сервером в документ визитки', async () => {
    const registered = await request
      .post('/api/auth/register')
      .send({ username: `font_${Date.now().toString(36)}`, password: 'password123', displayName: 'Шрифты' , ...CURRENT_LEGAL_VERSIONS });
    const token = registered.body.accessToken as string;
    const userId = registered.body.user.id as string;

    await request
      .put('/api/users/me/card')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/html')
      .send('<p style="font-family:QwillTest">Привет</p>');
    await request.patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bioMode: 'html' });

    const document = await request.get(`/c/${userId}/`).set('Host', env.cardHost);
    expect(document.text).toContain('@font-face');
    expect(document.text).toContain('font-family:"QwillTest"');
    expect(document.text).toContain('url("/fonts/QwillTest-Bold.woff2")');
    expect(document.text).toContain('font-weight:700');
    expect(document.text).not.toContain('QwillTest-Bold.ttf');

    await prisma.profileCard.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it('в документ попадают только семейства, упомянутые в самой визитке', async () => {
    const registered = await request
      .post('/api/auth/register')
      .send({ username: `font2_${Date.now().toString(36)}`, password: 'password123', displayName: 'Шрифты' , ...CURRENT_LEGAL_VERSIONS });
    const token = registered.body.accessToken as string;
    const userId = registered.body.user.id as string;

    await request
      .put('/api/users/me/card')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/html')
      .send('<p style="font-family:QwillPersist">Только один шрифт</p>');
    await request.patch('/api/users/me').set('Authorization', `Bearer ${token}`).send({ bioMode: 'html' });

    const document = await request.get(`/c/${userId}/`).set('Host', env.cardHost);
    expect(document.text).toContain('font-family:"QwillPersist"');
    expect(document.text).not.toContain('QwillTest');

    await prisma.profileCard.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it('шрифт из постоянной папки рядом со storage тоже попадает в список и отдаётся', async () => {
    const list = await request.get('/api/card-fonts');
    const families = (list.body as { family: string; weights: number[] }[]);
    const found = families.find((font) => font.family === 'QwillPersist');
    expect(found).toBeDefined();
    expect(found?.weights).toEqual([700]);

    const served = await request.get(`/fonts/${PERSISTENT}`).set('Host', env.cardHost);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('font/woff2');
  });

  it('при совпадении имени побеждает файл из постоянной папки', () => {
    expect(resolveProfileFontPath(FILES[0]!)).toBe(path.join(PROFILE_FONTS_PERSISTENT_DIR, FILES[0]!));
    expect(resolveProfileFontPath('QwillTest-Bold.woff2')).toBe(path.join(PROFILE_FONTS_DIR, 'QwillTest-Bold.woff2'));
  });

  it('файл шрифта отдаётся только из этой папки и только по известному имени', async () => {
    const served = await request.get('/fonts/QwillTest-Bold.woff2').set('Host', env.cardHost);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('font/woff2');
    expect(served.headers['x-content-type-options']).toBe('nosniff');

    const ignored = await request.get(`/fonts/${IGNORED}`).set('Host', env.cardHost);
    expect(ignored.status).toBe(404);

    const traversal = await request.get('/fonts/..%2F..%2Fpackage.json').set('Host', env.cardHost);
    expect(traversal.status).toBe(404);
  });
});
