import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

interface ByteRange {
  start: number;
  end: number;
}

const MAX_RANGES = 1024;
const OCTET_STREAM = 'application/octet-stream';

const CONTENT_TYPES: Record<string, string> = {
  '.exe': 'application/x-msdos-program',
  '.yml': 'text/yaml; charset=utf-8',
  '.blockmap': OCTET_STREAM,
};

function contentTypeOf(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? OCTET_STREAM;
}

function parseRanges(header: string, size: number): ByteRange[] | 'unsatisfiable' | null {
  const match = /^\s*bytes\s*=\s*(.+)$/i.exec(header);
  if (!match) return null;

  const specs = (match[1] ?? '').split(',');
  if (specs.length < 2 || specs.length > MAX_RANGES) return null;

  const ranges: ByteRange[] = [];
  for (const spec of specs) {
    const parsed = /^\s*(\d*)\s*-\s*(\d*)\s*$/.exec(spec);
    if (!parsed) return null;

    const [, fromText, toText] = parsed;
    if (fromText === '' && toText === '') return null;

    let start: number;
    let end: number;
    if (fromText === '') {
      const suffix = Number(toText);
      if (suffix === 0) continue;
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(fromText);
      end = toText === '' ? size - 1 : Math.min(Number(toText), size - 1);
    }

    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start >= size || end < start) continue;
    ranges.push({ start, end });
  }

  return ranges.length > 0 ? ranges : 'unsatisfiable';
}

function resolveWithin(root: string, requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const resolved = path.resolve(root, `.${path.posix.normalize(decoded)}`);
  const prefix = path.resolve(root) + path.sep;
  return resolved.startsWith(prefix) ? resolved : null;
}

function partHeader(boundary: string, type: string, range: ByteRange, size: number, first: boolean): Buffer {
  const lead = first ? '' : '\r\n';
  return Buffer.from(
    `${lead}--${boundary}\r\nContent-Type: ${type}\r\n` +
      `Content-Range: bytes ${range.start}-${range.end}/${size}\r\n\r\n`,
  );
}

function sendPart(res: Response, filePath: string, range: ByteRange): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { start: range.start, end: range.end });
    stream.once('error', reject);
    stream.once('end', resolve);
    stream.pipe(res, { end: false });
  });
}

async function sendMultipart(
  res: Response,
  filePath: string,
  ranges: ByteRange[],
  size: number,
): Promise<void> {
  const boundary = randomBytes(16).toString('hex');
  const type = contentTypeOf(filePath);
  const headers = ranges.map((range, index) => partHeader(boundary, type, range, size, index === 0));
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);

  const length =
    headers.reduce((sum, header) => sum + header.length, 0) +
    ranges.reduce((sum, range) => sum + range.end - range.start + 1, 0) +
    epilogue.length;

  res.status(206);
  res.setHeader('Content-Type', `multipart/byteranges; boundary=${boundary}`);
  res.setHeader('Content-Length', length);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');

  for (const [index, range] of ranges.entries()) {
    res.write(headers[index]);
    await sendPart(res, filePath, range);
  }
  res.end(epilogue);
}

export function multiRangeStatic(root: string): RequestHandler {
  const base = path.resolve(root);

  return function handleMultiRange(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    const header = req.headers.range;
    if (typeof header !== 'string' || !header.includes(',')) {
      next();
      return;
    }

    const filePath = resolveWithin(base, req.path);
    if (!filePath) {
      next();
      return;
    }

    void stat(filePath)
      .then((info) => {
        if (!info.isFile()) {
          next();
          return;
        }

        const ranges = parseRanges(header, info.size);
        if (ranges === null) {
          next();
          return;
        }
        if (ranges === 'unsatisfiable') {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${info.size}`);
          res.end();
          return;
        }
        if (req.method === 'HEAD') {
          next();
          return;
        }

        return sendMultipart(res, filePath, ranges, info.size);
      })
      .catch(() => {
        if (res.headersSent) res.destroy();
        else next();
      });
  };
}
