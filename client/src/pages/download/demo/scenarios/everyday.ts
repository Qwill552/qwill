import type { Scenario } from '../engine/timeline';

export const EVERYDAY_SCENARIO: Scenario = {
  id: 'everyday',
  scenes: [
    { durationMs: 1500, ease: 'linear', set: { screen: 'chats', chatsScroll: 0 } },
    { durationMs: 4200, ease: 'inOut', set: { chatsScroll: 430 } },
    { durationMs: 700, ease: 'linear' },
    { durationMs: 900, ease: 'linear', set: { screen: 'chat', feedScroll: 0 } },
    { durationMs: 2800, ease: 'inOut', set: { feedScroll: -240 } },
    { durationMs: 900, ease: 'linear' },
    { durationMs: 1400, ease: 'inOut', set: { feedScroll: 0 } },
    { durationMs: 2000, ease: 'inOut', set: { screen: 'chats', chatsScroll: 0 } },
  ],
};
