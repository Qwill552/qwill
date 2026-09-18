import { describe, expect, it } from 'vitest';

import { discreteOf, scenarioDuration, targetAt, type DemoTarget } from '../engine/timeline';
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

describe('сценарий А', () => {
  it('круг длится ровно 24 секунды', () => {
    expect(scenarioDuration(EVERYDAY_SCENARIO)).toBe(CYCLE_MS);
  });

  it('начинается со списка чатов наверху', () => {
    const start = at(0);
    expect(start.screen).toBe('chats');
    expect(start.chatsScroll).toBeCloseTo(0);
    expect(start.overlay).toBe('none');
    expect(start.recording).toBe(false);
  });

  it('лента чатов уезжает вниз и возвращается наверх до открытия чата', () => {
    expect(at(sceneStart(1)).chatsScroll).toBeGreaterThan(200);
    expect(at(sceneStart(2)).chatsScroll).toBeCloseTo(0);
    expect(at(sceneStart(2) - 1).screen).toBe('chats');
    expect(at(sceneStart(2)).screen).toBe('chat');
  });

  it('меню открывается на «Тихо, без мучений», подсвечивает смайл и закрывается', () => {
    const opened = at(sceneStart(4));
    expect(opened.overlay).toBe('menu');
    expect(opened.menuMessageId).toBe('m5');
    expect(opened.menuPick).toBeNull();

    expect(at(sceneStart(5)).menuPick).toBe(REACTION_EMOJI);
    expect(at(sceneStart(6)).overlay).toBe('none');
    expect(at(sceneStart(6)).menuMessageId).toBe('m5');
    expect(at(sceneStart(7)).menuMessageId).toBeNull();
  });

  it('реакция прилетает после того, как меню закрылось', () => {
    expect(at(sceneStart(6)).reactionMessageId).toBeNull();
    expect(at(sceneStart(7)).reactionMessageId).toBe('m5');
  });

  it('реакция стоит раньше набора текста', () => {
    const reactionAt = sceneStart(7);
    const typingAt = sceneStart(8);
    expect(reactionAt).toBeLessThan(typingAt);
    expect(at(typingAt).reactionMessageId).toBe('m5');
  });

  it('текст набирается посимвольно и доходит до конца', () => {
    const start = sceneStart(8);
    const span = EVERYDAY_SCENARIO.scenes[8]?.durationMs ?? 0;
    expect(at(start).composerText).toBe(TYPED_MESSAGE);
    expect(at(start).typing).toBeCloseTo(0);
    expect(at(start + span / 2).typing).toBeCloseTo(0.5, 2);
    expect(at(start + span - 1).typing).toBeGreaterThan(0.99);
  });

  it('между концом набора и отправкой есть пауза', () => {
    const pause = EVERYDAY_SCENARIO.scenes[9]?.durationMs ?? 0;
    expect(pause).toBeGreaterThanOrEqual(600);
    expect(at(sceneStart(9)).composerText).toBe(TYPED_MESSAGE);
    expect(at(sceneStart(9) + pause - 1).typing).toBeCloseTo(1);
  });

  it('после отправки композер пуст, пузырь появился, потом галочки', () => {
    expect(at(sceneStart(10)).composerText).toBe('');
    expect(at(sceneStart(10)).visibleMessages).toBe(DIALOG_WITH_OWN_REPLY);
    expect(at(sceneStart(10)).readUpTo).toBe(READ_AT_REST);
    expect(at(sceneStart(11)).readUpTo).toBe(READ_WITH_OWN_REPLY);
  });

  it('развязка, альбом и голосовое приходят в этом порядке', () => {
    expect(at(sceneStart(12)).visibleMessages).toBe(DIALOG_WITH_PUNCHLINE);
    expect(at(sceneStart(13)).visibleMessages).toBe(DIALOG_WITH_ALBUM);
    expect(at(sceneStart(14)).recording).toBe(true);
    expect(at(sceneStart(15)).recording).toBe(false);
    expect(at(sceneStart(15)).visibleMessages).toBe(DIALOG_WITH_VOICE);
  });

  it('счётчик записи идёт от нуля до конца ровно за свою сцену', () => {
    const start = sceneStart(14);
    const span = EVERYDAY_SCENARIO.scenes[14]?.durationMs ?? 0;
    expect(at(start).voice).toBeCloseTo(0);
    expect(at(start + span - 1).voice).toBeGreaterThan(0.99);
  });

  it('уборка происходит на списке, а не на видимом чате', () => {
    const backToList = sceneStart(16);
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
    for (const timeMs of [0, 3200, 9800, 14300, 19300, 23200]) {
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

  it('кадр для prefers-reduced-motion показывает чат с развязкой', () => {
    const frozen = at(18000);
    expect(frozen.screen).toBe('chat');
    expect(frozen.overlay).toBe('none');
    expect(frozen.recording).toBe(false);
    expect(frozen.reactionMessageId).toBe('m5');
    expect(frozen.visibleMessages).toBe(DIALOG_WITH_ALBUM);
  });
});
