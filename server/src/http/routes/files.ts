import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';

import {
  ErrorCode,
  initUploadSchema,
  UPLOAD_OFFSET_HEADER,
  type UploadChunkResponse,
} from '@messenger/shared';
import type { NextFunction, Request, Response } from 'express';
import { Router, raw } from 'express';

import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/errors.js';
import { signFileToken, verifyFileToken } from '../../lib/tokens.js';
import * as fileService from '../../services/file.js';
import { requireUserFromAccessToken } from '../../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadChunkLimiter, uploadLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';

export const filesRouter: Router = Router();

// С отдельными middleware (raw() и т.п.) в цепочке TS иногда теряет литеральный вывод параметров
// маршрута и типизирует req.params.id как string | string[] — нормализуем явно.
function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
}

filesRouter.post('/upload', requireAuth, uploadLimiter, validateBody(initUploadSchema), (req, res, next) => {
  fileService
    .initUpload(req.userId!, req.body)
    .then((result) => res.status(result.status === 'pending' ? 201 : 200).json(result))
    .catch(next);
});

filesRouter.patch(
  '/upload/:id',
  requireAuth,
  uploadChunkLimiter,
  raw({ type: () => true, limit: env.UPLOAD_CHUNK_SIZE_BYTES + 64 * 1024 }),
  (req, res, next) => {
    const offsetHeader = req.header(UPLOAD_OFFSET_HEADER);
    const offset = offsetHeader ? Number(offsetHeader) : NaN;
    if (!Number.isInteger(offset) || offset < 0 || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: { code: ErrorCode.VALIDATION_FAILED, message: 'Некорректный чанк' } });
      return;
    }

    fileService
      .appendChunk(paramId(req), req.userId!, offset, req.body)
      .then((result) => {
        if (result.status === 'offset-mismatch') {
          res.status(409).json({
            error: { code: ErrorCode.UPLOAD_OFFSET_MISMATCH, message: 'Смещение не совпадает, докачка с receivedBytes' },
            receivedBytes: result.receivedBytes,
          });
          return;
        }
        const body: UploadChunkResponse = {
          receivedBytes: result.receivedBytes,
          done: result.status === 'done',
          ...(result.status === 'done' ? { file: result.file } : {}),
        };
        res.json(body);
      })
      .catch(next);
  },
);

/** Короткоживущий токен для img/video src — Bearer-заголовок эти теги отправить не могут (секция 7). */
filesRouter.get('/:id/token', requireAuth, (req, res, next) => {
  const fileId = paramId(req);
  fileService
    .assertFileAccess(fileId, req.userId!)
    .then(() => res.json({ token: signFileToken(req.userId!, fileId) }))
    .catch(next);
});

/** Bearer — для обычных fetch-клиентов; query `token` — для <img>/<video> src (секция 7). */
async function resolveRequesterId(req: Request, fileId: string): Promise<string> {
  if (req.headers.authorization) {
    return requireUserFromAccessToken(req.headers.authorization);
  }

  const token = req.query.token;
  if (typeof token !== 'string') throw unauthorized();

  try {
    const payload = verifyFileToken(token);
    if (payload.fid !== fileId) throw unauthorized();
    return payload.sub;
  } catch {
    throw unauthorized();
  }
}

/** Раздача с Range-запросами (секция 7) — видео начинает играть сразу и мотается. */
filesRouter.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  const fileId = paramId(req);

  resolveRequesterId(req, fileId)
    .then((userId) => fileService.assertFileAccess(fileId, userId))
    .then(() => fileService.getFileForServing(fileId))
    .then(async (info) => {
      const stat = await fs.stat(info.path);

      res.setHeader('Content-Type', info.mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

      const range = req.headers.range;
      if (!range) {
        res.setHeader('Content-Length', String(stat.size));
        createReadStream(info.path).pipe(res);
        return;
      }

      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match?.[2] ? Number.parseInt(match[2], 10) : stat.size - 1;

      if (!match || Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      createReadStream(info.path, { start, end }).pipe(res);
    })
    .catch(next);
});
