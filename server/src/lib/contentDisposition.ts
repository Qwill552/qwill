const FALLBACK_FILE_NAME = 'file';
const MAX_FILE_NAME_LENGTH = 200;

export function sanitizeFileName(value: unknown): string {
  if (typeof value !== 'string') return FALLBACK_FILE_NAME;

  let name = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || char === '"') continue;
    if (char === '/' || char === '\\') {
      name = '';
      continue;
    }
    name += char;
  }

  name = name.replace(/^\.+/, '').trim().slice(0, MAX_FILE_NAME_LENGTH).trim();
  return name.length > 0 ? name : FALLBACK_FILE_NAME;
}

function toAsciiFileName(name: string): string {
  let ascii = '';
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    ascii += code >= 0x20 && code < 0x7f ? char : '_';
  }
  return ascii.length > 0 ? ascii : FALLBACK_FILE_NAME;
}

function toExtendedFileName(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*!]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function attachmentContentDisposition(rawName: unknown): string {
  const name = sanitizeFileName(rawName);
  return `attachment; filename="${toAsciiFileName(name)}"; filename*=UTF-8''${toExtendedFileName(name)}`;
}
