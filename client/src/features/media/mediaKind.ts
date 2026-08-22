import type { AttachmentDto } from '@messenger/shared';

export function isViewableMedia(attachment: AttachmentDto): boolean {
  return /^(image|video)\//.test(attachment.file.mimeType);
}

export function isVideoAttachment(attachment: AttachmentDto): boolean {
  return attachment.file.mimeType.startsWith('video/');
}
