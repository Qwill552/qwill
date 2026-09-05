export interface FollowTailInput {
  lastId: number | null;
  prevLastId: number | null;
  liveMessageId: number;
  isOwnLast: boolean;
  wasNewest: boolean;
  isAutoScrolling: boolean;
  scrollHeight: number;
  prevScrollHeight: number;
  scrollTop: number;
  clientHeight: number;
  bottomReserve: number;
  stickThreshold: number;
}

export function isTailArrival(lastId: number | null, liveMessageId: number): boolean {
  if (lastId === null) return false;
  return lastId < 0 || lastId === liveMessageId;
}

export function distanceBeforeGrowth(input: FollowTailInput): number {
  const growth = Math.max(0, input.scrollHeight - input.prevScrollHeight);
  return input.scrollHeight - input.scrollTop - input.clientHeight - input.bottomReserve - growth;
}

export function shouldFollowTail(input: FollowTailInput): boolean {
  if (input.lastId === null || input.lastId === input.prevLastId) return false;
  if (!input.wasNewest) return false;

  const arrival = isTailArrival(input.lastId, input.liveMessageId);
  if (arrival && (input.isOwnLast || input.isAutoScrolling)) return true;

  return distanceBeforeGrowth(input) <= input.stickThreshold;
}
