import { promises as fs } from 'node:fs';
import path from 'node:path';

import { app, protocol } from 'electron';

export const APP_SCHEME = 'app';
export const APP_HOST = 'qwill';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY_URL = `${APP_ORIGIN}/`;
export const APP_USER_MODEL_ID = 'com.qwill.desktop';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
};

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

export function resolveClientRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'client')
    : path.resolve(__dirname, '..', 'renderer');
}

function contentTypeFor(filePath: string): string {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

interface ServedFile {
  filePath: string;
  body: Buffer;
}

async function readFileWithin(root: string, requestPath: string): Promise<ServedFile | null> {
  let relative: string;
  try {
    relative = decodeURIComponent(requestPath).replace(/^\/+/, '');
  } catch {
    return null;
  }

  const filePath = path.resolve(root, relative === '' ? 'index.html' : relative);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) return null;

  try {
    const body = await fs.readFile(filePath);
    return { filePath, body };
  } catch {
    return null;
  }
}

function fileResponse(file: ServedFile): Response {
  return new Response(file.body, {
    status: 200,
    headers: {
      'content-type': contentTypeFor(file.filePath),
      'cache-control': 'no-cache',
    },
  });
}

export function handleAppProtocol(clientRoot: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);

    const direct = await readFileWithin(clientRoot, pathname);
    if (direct) return fileResponse(direct);

    if (path.extname(pathname) !== '') return new Response('Not Found', { status: 404 });

    const entry = await readFileWithin(clientRoot, '/index.html');
    if (!entry) return new Response(`Сборка клиента не найдена: ${clientRoot}`, { status: 500 });
    return fileResponse(entry);
  });
}
