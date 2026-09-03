import type { TileTint } from '../../ui/IconTile';
import type { IconName } from '../../ui/Icon';

export interface FileKind {
  icon: IconName;
  tint: TileTint;
}

const ARCHIVE_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
]);

export function fileKindFor(mimeType: string): FileKind {
  if (mimeType.startsWith('audio/')) return { icon: 'headphones', tint: 'teal' };
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return { icon: 'image', tint: 'blue' };
  if (mimeType === 'application/pdf') return { icon: 'file', tint: 'red' };
  if (ARCHIVE_MIME_TYPES.has(mimeType)) return { icon: 'folder', tint: 'violet' };
  return { icon: 'file', tint: 'indigo' };
}
