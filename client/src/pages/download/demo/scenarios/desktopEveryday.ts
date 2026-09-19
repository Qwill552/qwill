import { LAPTOP_CURSOR, LAPTOP_SCENE_MS } from '../../config';
import {
  DIALOG_BEFORE_REPLY,
  DIALOG_WITH_ALBUM,
  DIALOG_WITH_OWN_REPLY,
  DIALOG_WITH_PUNCHLINE,
  DIALOG_WITH_VOICE,
  PRESS,
  READ_AT_REST,
  READ_WITH_OWN_REPLY,
  REACTION_EMOJI,
  TYPED_MESSAGE,
} from '../replica/phone/demoData';
import type { Scenario } from '../engine/timeline';

const LIST_PEEK = 300;

const HOVER_ROW = 'artem';

function at(point: { x: number; y: number }) {
  return { cursorX: point.x, cursorY: point.y };
}

export const DESKTOP_EVERYDAY_SCENARIO: Scenario = {
  id: 'desktop-everyday',
  scenes: [
    {
      durationMs: LAPTOP_SCENE_MS.listGlide,
      ease: 'inOut',
      set: {
        ...at(LAPTOP_CURSOR.listRest),
        screen: 'chats',
        chatsScroll: LIST_PEEK,
        feedScroll: 0,
        visibleMessages: DIALOG_BEFORE_REPLY,
        readUpTo: READ_AT_REST,
        reactionMessageId: null,
        composerText: '',
        composerFocused: false,
        pressed: null,
        hoverRow: null,
        search: false,
        typing: 0,
        voice: 0,
      },
    },
    {
      durationMs: LAPTOP_SCENE_MS.listSettle,
      ease: 'inOut',
      set: { ...at(LAPTOP_CURSOR.chatRow), chatsScroll: 0, hoverRow: HOVER_ROW },
    },
    { durationMs: LAPTOP_SCENE_MS.rowPress, ease: 'linear', set: { pressed: PRESS.row } },
    { durationMs: LAPTOP_SCENE_MS.chatOpen, ease: 'linear', set: { screen: 'chat' } },
    {
      durationMs: LAPTOP_SCENE_MS.toBubble,
      ease: 'inOut',
      set: { ...at(LAPTOP_CURSOR.bubble), pressed: null, hoverRow: null },
    },
    { durationMs: LAPTOP_SCENE_MS.bubblePress, ease: 'linear', set: { pressed: PRESS.bubble } },
    {
      durationMs: LAPTOP_SCENE_MS.menuOpen,
      ease: 'linear',
      set: { overlay: 'menu', menuMessageId: 'm5', pressed: null },
    },
    {
      durationMs: LAPTOP_SCENE_MS.menuPick,
      ease: 'inOut',
      set: { ...at(LAPTOP_CURSOR.reaction), menuPick: REACTION_EMOJI },
    },
    { durationMs: LAPTOP_SCENE_MS.menuClose, ease: 'linear', set: { overlay: 'none' } },
    {
      durationMs: LAPTOP_SCENE_MS.reactionArrive,
      ease: 'inOut',
      set: {
        ...at(LAPTOP_CURSOR.composer),
        menuMessageId: null,
        menuPick: null,
        reactionMessageId: 'm5',
      },
    },
    {
      durationMs: LAPTOP_SCENE_MS.composerPress,
      ease: 'linear',
      set: { pressed: PRESS.composer, composerFocused: true },
    },
    {
      durationMs: LAPTOP_SCENE_MS.typing,
      ease: 'linear',
      set: { pressed: null, composerText: TYPED_MESSAGE, typing: 1 },
    },
    { durationMs: LAPTOP_SCENE_MS.beforeSend, ease: 'inOut', set: at(LAPTOP_CURSOR.send) },
    { durationMs: LAPTOP_SCENE_MS.sendPress, ease: 'linear', set: { pressed: PRESS.send } },
    {
      durationMs: LAPTOP_SCENE_MS.sent,
      ease: 'linear',
      set: {
        pressed: null,
        composerText: '',
        composerFocused: false,
        typing: 0,
        visibleMessages: DIALOG_WITH_OWN_REPLY,
      },
    },
    { durationMs: LAPTOP_SCENE_MS.read, ease: 'linear', set: { readUpTo: READ_WITH_OWN_REPLY } },
    {
      durationMs: LAPTOP_SCENE_MS.punchline,
      ease: 'linear',
      set: { visibleMessages: DIALOG_WITH_PUNCHLINE },
    },
    {
      durationMs: LAPTOP_SCENE_MS.album,
      ease: 'linear',
      set: { visibleMessages: DIALOG_WITH_ALBUM },
    },
    {
      durationMs: LAPTOP_SCENE_MS.recording,
      ease: 'linear',
      set: { recording: true, pressed: PRESS.mic, voice: 1 },
    },
    {
      durationMs: LAPTOP_SCENE_MS.voiceSent,
      ease: 'linear',
      set: {
        recording: false,
        pressed: null,
        voice: 0,
        visibleMessages: DIALOG_WITH_VOICE,
      },
    },
    { durationMs: LAPTOP_SCENE_MS.toSearch, ease: 'inOut', set: at(LAPTOP_CURSOR.search) },
    { durationMs: LAPTOP_SCENE_MS.searchPress, ease: 'linear', set: { pressed: PRESS.search } },
    {
      durationMs: LAPTOP_SCENE_MS.searchOpen,
      ease: 'linear',
      set: { search: true, pressed: null },
    },
    {
      durationMs: LAPTOP_SCENE_MS.searchClose,
      ease: 'inOut',
      set: { ...at(LAPTOP_CURSOR.listRest), search: false, screen: 'chats', chatsScroll: 0 },
    },
  ],
};
