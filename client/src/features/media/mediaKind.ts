import { isPlayableVideoMimeType, type AttachmentDto } from '@messenger/shared';

export function isViewableMedia(attachment: AttachmentDto): boolean {
  return attachment.file.mimeType.startsWith('image/') || isVideoAttachment(attachment);
}

export function isVideoAttachment(attachment: AttachmentDto): boolean {
  return isPlayableVideoMimeType(attachment.file.mimeType);
}

export function isGifAttachment(attachment: AttachmentDto): boolean {
  return attachment.file.mimeType === 'image/gif';
}
