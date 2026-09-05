export interface DeletableMessageLike {
  id: number;
  deletedAt: string | null;
  sender: { id: string } | null;
}

/** Тот же порог, что и на сервере (services/message.ts → assertCanDeleteMessage): своё
 *  сообщение либо права админа группы. Ещё не отправленное (id ≤ 0) и уже удалённое
 *  удалять нечего. */
export function isDeletableMessage(message: DeletableMessageLike, myId: string | null, isGroupAdmin: boolean): boolean {
  if (message.id <= 0 || message.deletedAt !== null) return false;
  return message.sender?.id === myId || isGroupAdmin;
}

/** Пакетное удаление сервер отвергает целиком, если в пачке есть хоть одно чужое сообщение,
 *  поэтому «Удалить» в мультивыборе показывается только когда удалить можно каждое. */
export function isDeletableSelection(messages: DeletableMessageLike[], myId: string | null, isGroupAdmin: boolean): boolean {
  return messages.length > 0 && messages.every((message) => isDeletableMessage(message, myId, isGroupAdmin));
}
