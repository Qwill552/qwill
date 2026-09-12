import { useChatStore } from '../../stores/chatStore';

export type JumpOutcome = 'ok' | 'failed' | 'superseded';

let generation = 0;
let chain: Promise<unknown> = Promise.resolve();

export function cancelSearchJumps(): void {
  generation += 1;
}

export function jumpToSearchResult(chatId: string, messageId: number): Promise<JumpOutcome> {
  const mine = ++generation;

  const run = chain.then(async (): Promise<JumpOutcome> => {
    if (mine !== generation) return 'superseded';

    const store = useChatStore.getState();
    if (store.messagesByChat[chatId]?.some((message) => message.id === messageId)) {
      store.focusMessage(chatId, messageId);
      return 'ok';
    }

    const placed = await store.openChatAt(chatId, messageId);
    if (mine !== generation) return 'superseded';
    return placed ? 'ok' : 'failed';
  });

  chain = run.catch(() => undefined);
  return run;
}
