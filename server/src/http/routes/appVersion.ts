import { createReadStream } from 'node:fs';

import { ErrorCode } from '@messenger/shared';
import { Router } from 'express';

import * as appReleaseService from '../../services/appRelease.js';

export const appVersionRouter: Router = Router();

/** Без авторизации: версию спрашивает и оболочка до входа, и страница /download в браузере. */
appVersionRouter.get('/version', (_req, res, next) => {
  appReleaseService
    .getAndroidRelease()
    .then((release) => {
      if (!release) {
        res.status(404).json({ error: { code: ErrorCode.NOT_FOUND, message: 'Выпуск не опубликован' } });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json(release);
    })
    .catch(next);
});

/** Раздача APK самим Express, а не Caddy: файл лежит вне client/dist, поэтому не попадает
 *  ни в прекэш service worker, ни под правила статики, а новый блок в общем Caddyfile
 *  потребовал бы restart, обрывающий все домены машины. Range — ради докачки. */
appVersionRouter.get('/apk', (req, res, next) => {
  appReleaseService
    .getAndroidApkFile()
    .then((apk) => {
      if (!apk) {
        res.status(404).json({ error: { code: ErrorCode.NOT_FOUND, message: 'Выпуск не опубликован' } });
        return;
      }

      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${apk.fileName}"`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');

      const range = req.headers.range;
      if (!range) {
        res.setHeader('Content-Length', String(apk.size));
        createReadStream(apk.path).pipe(res);
        return;
      }

      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match?.[2] ? Number.parseInt(match[2], 10) : apk.size - 1;

      if (!match || Number.isNaN(start) || Number.isNaN(end) || start > end || end >= apk.size) {
        res.status(416).setHeader('Content-Range', `bytes */${apk.size}`).end();
        return;
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${apk.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      createReadStream(apk.path, { start, end }).pipe(res);
    })
    .catch(next);
});
