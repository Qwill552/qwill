import { isPlayableVideoMimeType } from '@messenger/shared';

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

const KIND_BY_EXTENSION: Record<string, FileKind> = {};

function assignExtensions(extensions: readonly string[], kind: FileKind): void {
  for (const extension of extensions) KIND_BY_EXTENSION[extension] = kind;
}

assignExtensions(['pdf'], { icon: 'file', tint: 'red' });
assignExtensions(['doc', 'docx', 'rtf', 'odt', 'pages'], { icon: 'file', tint: 'blue' });
assignExtensions(['xls', 'xlsx', 'csv', 'ods'], { icon: 'file', tint: 'green' });
assignExtensions(['ppt', 'pptx', 'odp'], { icon: 'file', tint: 'orange' });
assignExtensions(['zip', 'rar', '7z', 'tar', 'gz', 'bz2'], { icon: 'folder', tint: 'violet' });
assignExtensions(['iso', 'img', 'dmg'], { icon: 'folder', tint: 'indigo' });
assignExtensions(['mkv', 'avi', 'mov', 'wmv', 'flv'], { icon: 'video', tint: 'blue' });
assignExtensions(['txt', 'md', 'json', 'xml', 'log'], { icon: 'file', tint: 'teal' });
assignExtensions(['ttf', 'otf', 'woff', 'woff2'], { icon: 'file', tint: 'pink' });
assignExtensions(['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'wma'], {
  icon: 'headphones',
  tint: 'teal',
});
assignExtensions(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'tiff', 'svg'], {
  icon: 'image',
  tint: 'blue',
});

export function fileExtension(fileName: string): string {
  const base = fileName.slice(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function fileKindFor(mimeType: string, fileName = ''): FileKind {
  const byExtension = KIND_BY_EXTENSION[fileExtension(fileName)];
  if (byExtension) return byExtension;

  if (mimeType.startsWith('audio/')) return { icon: 'headphones', tint: 'teal' };
  if (mimeType.startsWith('image/') || isPlayableVideoMimeType(mimeType)) return { icon: 'image', tint: 'blue' };
  if (mimeType.startsWith('video/')) return { icon: 'video', tint: 'blue' };
  if (mimeType === 'application/pdf') return { icon: 'file', tint: 'red' };
  if (ARCHIVE_MIME_TYPES.has(mimeType)) return { icon: 'folder', tint: 'violet' };
  return { icon: 'file', tint: 'indigo' };
}
