import { readFileSync } from 'node:fs';
import path from 'node:path';

import { app, session } from 'electron';

const DEFAULT_API_URL = 'https://localhost:3000';
const API_CONFIG_FILE = 'api-origin.json';

function configFileCandidates(): string[] {
  if (!app.isPackaged) return [path.resolve(__dirname, '..', API_CONFIG_FILE)];
  return [
    path.join(app.getAppPath(), API_CONFIG_FILE),
    path.join(process.resourcesPath, API_CONFIG_FILE),
  ];
}

function configuredApiUrl(): string {
  const fromEnv = process.env.QWILL_API_URL;
  if (fromEnv) return fromEnv;

  for (const configFile of configFileCandidates()) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(configFile, 'utf8'));
      const apiUrl = (parsed as { apiUrl?: unknown }).apiUrl;
      if (typeof apiUrl === 'string' && apiUrl !== '') return apiUrl;
    } catch {
      continue;
    }
  }

  return DEFAULT_API_URL;
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return new URL(DEFAULT_API_URL).origin;
  }
}

export const API_ORIGIN = normalizeOrigin(configuredApiUrl());

const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-sanitized-write', 'fullscreen']);

function toCrossSiteCookie(header: string): string {
  const attributes = header
    .split(';')
    .filter((part) => !/^\s*samesite\s*=/i.test(part))
    .filter((part) => !/^\s*secure\s*$/i.test(part))
    .join(';');
  return `${attributes}; SameSite=None; Secure`;
}

function allowRefreshCookieAcrossSchemes(): void {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: [`${API_ORIGIN}/*`] },
    (details, callback) => {
      const headers = details.responseHeaders;
      if (!headers) {
        callback({});
        return;
      }

      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() !== 'set-cookie') continue;
        const values = headers[name];
        if (Array.isArray(values)) headers[name] = values.map(toCrossSiteCookie);
      }

      callback({ responseHeaders: headers });
    },
  );
}

function allowMediaCapture(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  );
}

export function configureApiSession(): void {
  allowRefreshCookieAcrossSchemes();
  allowMediaCapture();
}
