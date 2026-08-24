import type { MessageDto } from '@messenger/shared';

export function isEditableMessage(message: MessageDto): boolean {
  return message.type === 'TEXT' && message.attachment === null;
}
