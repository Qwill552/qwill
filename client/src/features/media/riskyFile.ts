import { fileExtension } from './fileKind';

export const RISKY_EXTENSIONS: readonly string[] = [
  'exe',
  'msi',
  'bat',
  'cmd',
  'com',
  'pif',
  'scr',
  'hta',
  'reg',
  'lnk',
  'msc',
  'vbs',
  'vbe',
  'js',
  'jse',
  'ws',
  'wsf',
  'wsh',
  'ps1',
  'psm1',
  'apk',
  'jar',
  'app',
  'pkg',
  'dmg',
  'deb',
  'rpm',
  'sh',
  'run',
  'svg',
];

const MUTE_STORAGE_KEY = 'qwill.riskyFileWarningMuted';

export function isRiskyFileName(fileName: string): boolean {
  return RISKY_EXTENSIONS.includes(fileExtension(fileName));
}

export function isRiskyWarningMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function muteRiskyWarning(): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, '1');
  } catch {
    return;
  }
}
