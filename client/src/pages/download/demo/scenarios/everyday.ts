import {
  DIALOG_BEFORE_REPLY,
  DIALOG_WITH_ALBUM,
  DIALOG_WITH_OWN_REPLY,
  DIALOG_WITH_PUNCHLINE,
  DIALOG_WITH_VOICE,
  READ_AT_REST,
  READ_WITH_OWN_REPLY,
  REACTION_EMOJI,
  TYPED_MESSAGE,
} from '../replica/phone/demoData';
import type { Scenario } from '../engine/timeline';

const CHATS_PEEK = 260;

export const EVERYDAY_SCENARIO: Scenario = {
  id: 'everyday',
  scenes: [
    {
      durationMs: 2200,
      ease: 'inOut',
      set: {
        screen: 'chats',
        chatsScroll: CHATS_PEEK,
        visibleMessages: DIALOG_BEFORE_REPLY,
        readUpTo: READ_AT_REST,
        reactionMessageId: null,
        composerText: '',
        typing: 0,
        voice: 0,
      },
    },
    { durationMs: 1000, ease: 'inOut', set: { chatsScroll: 0 } },
    { durationMs: 1100, ease: 'linear', set: { screen: 'chat', feedScroll: 0 } },
    { durationMs: 1500, ease: 'linear' },
    { durationMs: 900, ease: 'linear', set: { overlay: 'menu', menuMessageId: 'm5' } },
    { durationMs: 1200, ease: 'linear', set: { menuPick: REACTION_EMOJI } },
    { durationMs: 500, ease: 'linear', set: { overlay: 'none' } },
    {
      durationMs: 1400,
      ease: 'linear',
      set: { menuMessageId: null, menuPick: null, reactionMessageId: 'm5' },
    },
    { durationMs: 2900, ease: 'linear', set: { composerText: TYPED_MESSAGE, typing: 1 } },
    { durationMs: 900, ease: 'linear' },
    {
      durationMs: 700,
      ease: 'linear',
      set: { composerText: '', typing: 0, visibleMessages: DIALOG_WITH_OWN_REPLY },
    },
    { durationMs: 600, ease: 'linear', set: { readUpTo: READ_WITH_OWN_REPLY } },
    { durationMs: 1900, ease: 'linear', set: { visibleMessages: DIALOG_WITH_PUNCHLINE } },
    { durationMs: 2500, ease: 'linear', set: { visibleMessages: DIALOG_WITH_ALBUM } },
    { durationMs: 3000, ease: 'linear', set: { recording: true, voice: 1 } },
    {
      durationMs: 900,
      ease: 'linear',
      set: { recording: false, voice: 0, visibleMessages: DIALOG_WITH_VOICE },
    },
    { durationMs: 800, ease: 'linear', set: { screen: 'chats', chatsScroll: 0 } },
  ],
};
