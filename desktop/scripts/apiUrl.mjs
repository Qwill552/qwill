import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const MKCERT_DIR = path.join(homedir(), '.vite-plugin-mkcert');

function devServerUsesHttps() {
  return existsSync(path.join(MKCERT_DIR, 'dev.pem')) && existsSync(path.join(MKCERT_DIR, 'cert.pem'));
}

export function resolveApiUrl() {
  if (process.env.QWILL_API_URL) return process.env.QWILL_API_URL;
  return `${devServerUsesHttps() ? 'https' : 'http'}://localhost:3000`;
}
