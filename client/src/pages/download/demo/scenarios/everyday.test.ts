import { describe, expect, it } from 'vitest';

import { discreteOf, scenarioDuration, targetAt, type DemoTarget } from '../engine/timeline';
import {
  DIALOG,
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
import { EVERYDAY_SCENARIO } from './everyday';

const CYCLE_MS = 24000;

function at(timeMs: number): DemoTarget {
  return targetAt(EVERYDAY_SCENARIO, timeMs);
}

function sceneStart(index: number): number {
  return EVERYDAY_SCENARIO.scenes
    .slice(0, index)
    .reduce((total, scene) => total + scene.durationMs, 0);
}

function spanOf(index: number): number {
  return EVERYDAY_SCENARIO.scenes[index]?.durationMs ?? 0;
}

describe('сценарий А', () => {
  it('круг длится ровно 24 секунды', () => {
    expect(scenarioDuration(EVERYDAY_SCENARIO)).toBe(CYCLE_MS);
  });

  it('начинается со списка чатов наверху и без единого нажатия', () => {
    const start = at(0);
    expect(start.screen).toBe('chats');
    expect(start.chatsScroll).toBeCloseTo(0);
    expect(start.overlay).toBe('none');
    expect(start.recording).toBe(false);
    expect(start.pressed).toBeNull();
    expect(start.composerFocused).toBe(false);
  });

  it('лента чатов уезжает вниз и возвращается наверх до открытия чата', () => {
    expect(at(sceneStart(1)).chatsScroll).toBeGreaterThan(200);
    expect(at(sceneStart(2)).chatsScroll).toBeCloseTo(0);
    expect(at(sceneStart(3) - 1).screen).toBe('chats');
    expect(at(sceneStart(3)).screen).toBe('chat');
  });

  it('строка Артёма нажимается до перехода и держится нажатой во время него', () => {
    expect(at(sceneStart(2) - 1).pressed).toBeNull();
    expect(at(sceneStart(2)).pressed).toBe(PRESS.row);
    expect(at(sceneStart(2)).screen).toBe('chats');
    expect(at(sceneStart(3)).pressed).toBe(PRESS.row);
    expect(at(sceneStart(4)).pressed).toBeNull();
  });

  it('пузырь держат до того, как откроется меню', () => {
    expect(at(sceneStart(5)).pressed).toBe(PRESS.bubble);
    expect(at(sceneStart(5)).overlay).toBe('none');
    expect(at(sceneStart(5)).menuMessageId).toBeNull();
    expect(spanOf(5)).toBeGreaterThanOrEqual(500);
  });

  it('меню открывается на «Тихо, без мучений», подсвечивает смайл и закрывается', () => {
    const opened = at(sceneStart(6));
    expect(opened.overlay).toBe('menu');
    expect(opened.menuMessageId).toBe('m5');
    expect(opened.menuPick).toBeNull();
    expect(opened.pressed).toBeNull();

    expect(at(sceneStart(7)).menuPick).toBe(REACTION_EMOJI);
    expect(at(sceneStart(8)).overlay).toBe('none');
    expect(at(sceneStart(8)).menuMessageId).toBe('m5');
    expect(at(sceneStart(9)).menuMessageId).toBeNull();
  });

  it('реакция прилетает после того, как меню закрылось', () => {
    expect(at(sceneStart(8)).reactionMessageId).toBeNull();
    expect(at(sceneStart(9)).reactionMessageId).toBe('m5');
  });

  it('реакцию ставит пользователь: он держит пузырь, выбирает смайл, и чип появляется на нём', () => {
    expect(at(sceneStart(5)).pressed).toBe(PRESS.bubble);
    expect(at(sceneStart(7)).menuPick).toBe(REACTION_EMOJI);
    expect(at(sceneStart(9)).reactionMessageId).toBe(PRESS.bubble);
    expect(DIALOG.find((message) => message.id === PRESS.bubble)?.own).toBe(false);
  });

  it('голосовое записывает и отправляет пользователь, поэтому оно своё', () => {
    const voice = DIALOG[DIALOG_WITH_VOICE - 1];
    expect(voice?.kind).toBe('voice');
    expect(voice?.own).toBe(true);
    expect(at(sceneStart(18)).pressed).toBe(PRESS.mic);
    expect(at(sceneStart(19)).readUpTo).toBeLessThan(DIALOG_WITH_VOICE);
  });

  it('реакция стоит раньше набора текста', () => {
    expect(sceneStart(9)).toBeLessThan(sceneStart(11));
    expect(at(sceneStart(11)).reactionMessageId).toBe('m5');
  });

  it('по полю ввода нажимают, и оно остаётся в фокусе до самой отправки', () => {
    expect(at(sceneStart(10)).pressed).toBe(PRESS.composer);
    expect(at(sceneStart(10)).composerFocused).toBe(true);
    expect(at(sceneStart(10)).composerText).toBe('');
    expect(at(sceneStart(11)).pressed).toBeNull();
    expect(at(sceneStart(11)).composerFocused).toBe(true);
    expect(at(sceneStart(14)).composerFocused).toBe(false);
  });

  it('текст набирается посимвольно и доходит до конца', () => {
    const start = sceneStart(11);
    const span = spanOf(11);
    expect(at(start).composerText).toBe(TYPED_MESSAGE);
    expect(at(start).typing).toBeCloseTo(0);
    expect(at(start + span / 2).typing).toBeCloseTo(0.5, 2);
    expect(at(start + span - 1).typing).toBeGreaterThan(0.99);
  });

  it('между концом набора и отправкой есть пауза', () => {
    const pause = spanOf(12);
    expect(pause).toBeGreaterThanOrEqual(600);
    expect(at(sceneStart(12)).composerText).toBe(TYPED_MESSAGE);
    expect(at(sceneStart(12) + pause - 1).typing).toBeCloseTo(1);
  });

  it('кнопку отправки продавливают до того, как пузырь появится', () => {
    expect(at(sceneStart(13)).pressed).toBe(PRESS.send);
    expect(at(sceneStart(13)).composerText).toBe(TYPED_MESSAGE);
    expect(at(sceneStart(13)).visibleMessages).toBe(DIALOG_BEFORE_REPLY);
    expect(at(sceneStart(14)).pressed).toBeNull();
  });

  it('после отправки композер пуст, пузырь появился, потом галочки', () => {
    expect(at(sceneStart(14)).composerText).toBe('');
    expect(at(sceneStart(14)).visibleMessages).toBe(DIALOG_WITH_OWN_REPLY);
    expect(at(sceneStart(14)).readUpTo).toBe(READ_AT_REST);
    expect(at(sceneStart(15)).readUpTo).toBe(READ_WITH_OWN_REPLY);
  });

  it('развязка, альбом и голосовое приходят в этом порядке', () => {
    expect(at(sceneStart(16)).visibleMessages).toBe(DIALOG_WITH_PUNCHLINE);
    expect(at(sceneStart(17)).visibleMessages).toBe(DIALOG_WITH_ALBUM);
    expect(at(sceneStart(18)).recording).toBe(true);
    expect(at(sceneStart(19)).recording).toBe(false);
    expect(at(sceneStart(19)).visibleMessages).toBe(DIALOG_WITH_VOICE);
  });

  it('микрофон удерживают ровно столько, сколько идёт запись', () => {
    expect(at(sceneStart(18)).pressed).toBe(PRESS.mic);
    expect(at(sceneStart(19) - 1).pressed).toBe(PRESS.mic);
    expect(at(sceneStart(19) - 1).recording).toBe(true);
    expect(at(sceneStart(19)).pressed).toBeNull();
  });

  it('кнопку «назад» нажимают до возврата и держат во время перехода', () => {
    expect(at(sceneStart(20)).pressed).toBe(PRESS.back);
    expect(at(sceneStart(20)).screen).toBe('chat');
    expect(at(sceneStart(21)).pressed).toBe(PRESS.back);
    expect(at(sceneStart(21)).screen).toBe('chats');
    expect(at(0).pressed).toBeNull();
  });

  it('счётчик записи идёт от нуля до конца ровно за свою сцену', () => {
    const start = sceneStart(18);
    const span = spanOf(18);
    expect(at(start).voice).toBeCloseTo(0);
    expect(at(start + span - 1).voice).toBeGreaterThan(0.99);
  });

  it('каждое нажатие держится достаточно долго, чтобы его успеть заметить', () => {
    const pressScenes = EVERYDAY_SCENARIO.scenes.filter((scene) => Boolean(scene.set?.pressed));
    expect(pressScenes).toHaveLength(6);
    for (const scene of pressScenes) expect(scene.durationMs).toBeGreaterThanOrEqual(300);
  });

  it('каждое событие в чате имеет видимую причину прямо перед собой', () => {
    expect(at(sceneStart(3) - 1).pressed).toBe(PRESS.row);
    expect(at(sceneStart(6) - 1).pressed).toBe(PRESS.bubble);
    expect(at(sceneStart(11) - 1).pressed).toBe(PRESS.composer);
    expect(at(sceneStart(14) - 1).pressed).toBe(PRESS.send);
    expect(at(sceneStart(21) - 1).pressed).toBe(PRESS.back);
  });

  it('уборка происходит на списке, а не на видимом чате', () => {
    const backToList = sceneStart(21);
    expect(at(backToList).screen).toBe('chats');
    expect(at(backToList).visibleMessages).toBe(DIALOG_WITH_VOICE);
    expect(at(backToList).reactionMessageId).toBe('m5');

    expect(at(0).visibleMessages).toBe(DIALOG_BEFORE_REPLY);
    expect(at(0).reactionMessageId).toBeNull();
    expect(at(0).readUpTo).toBe(READ_AT_REST);
  });

  it('шва не видно: конец круга и его начало совпадают дискретно и непрерывно', () => {
    const before = at(CYCLE_MS - 1);
    const after = at(CYCLE_MS);
    expect(discreteOf(after)).toEqual(discreteOf(at(0)));
    expect(before.screen).toBe('chats');
    expect(Math.abs(before.chatsScroll - after.chatsScroll)).toBeLessThan(0.5);
    expect(Math.abs(before.feedScroll - after.feedScroll)).toBeLessThan(0.5);
    expect(Math.abs(before.typing - after.typing)).toBeLessThan(0.01);
    expect(Math.abs(before.voice - after.voice)).toBeLessThan(0.01);
  });

  it('круг повторяется без накопления', () => {
    for (const timeMs of [0, 2900, 9800, 13800, 19100, 22900]) {
      expect(at(timeMs)).toEqual(at(timeMs + CYCLE_MS));
      expect(at(timeMs)).toEqual(at(timeMs + CYCLE_MS * 7));
    }
  });

  it('лента переписки никогда не уходит в накопленные сообщения сама', () => {
    for (let timeMs = 0; timeMs < CYCLE_MS; timeMs += 100) {
      expect(at(timeMs).feedScroll).toBeCloseTo(0);
      expect(at(timeMs).visibleMessages).toBeGreaterThanOrEqual(DIALOG_BEFORE_REPLY);
      expect(at(timeMs).visibleMessages).toBeLessThanOrEqual(DIALOG_WITH_VOICE);
    }
  });

  it('шит вложений в сценарии А не показывается', () => {
    for (let timeMs = 0; timeMs < CYCLE_MS; timeMs += 50) {
      expect(at(timeMs).overlay).not.toBe('attach');
    }
  });

  it('пока чат открыт, меню и запись не накладываются друг на друга', () => {
    for (let timeMs = 0; timeMs < CYCLE_MS; timeMs += 50) {
      const frame = at(timeMs);
      expect(frame.overlay === 'menu' && frame.recording).toBe(false);
      expect(frame.composerText !== '' && frame.recording).toBe(false);
    }
  });

  it('нажатым не бывает больше одного элемента и меню нажатия не переживают', () => {
    for (let timeMs = 0; timeMs < CYCLE_MS; timeMs += 50) {
      const frame = at(timeMs);
      expect(frame.overlay === 'menu' && frame.pressed !== null).toBe(false);
      expect(frame.pressed === PRESS.mic && !frame.recording).toBe(false);
    }
  });

  it('кадр для prefers-reduced-motion показывает чат с развязкой', () => {
    const frozen = at(18000);
    expect(frozen.screen).toBe('chat');
    expect(frozen.overlay).toBe('none');
    expect(frozen.recording).toBe(false);
    expect(frozen.pressed).toBeNull();
    expect(frozen.reactionMessageId).toBe('m5');
    expect(frozen.visibleMessages).toBe(DIALOG_WITH_ALBUM);
  });
});
