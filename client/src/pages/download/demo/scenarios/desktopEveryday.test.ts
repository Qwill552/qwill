import { describe, expect, it } from 'vitest';

import { LAPTOP_CURSOR, LAPTOP_LOGICAL, LAPTOP_MENU, laptopMenuOrigin } from '../../config';
import { discreteOf, scenarioDuration, targetAt, type DemoTarget } from '../engine/timeline';
import {
  DIALOG_BEFORE_REPLY,
  DIALOG_WITH_ALBUM,
  DIALOG_WITH_OWN_REPLY,
  DIALOG_WITH_PUNCHLINE,
  DIALOG_WITH_VOICE,
  MESSAGE_MENU_ITEMS,
  PRESS,
  QUICK_REACTIONS,
  REACTION_EMOJI,
  TYPED_MESSAGE,
} from '../replica/phone/demoData';
import { DESKTOP_EVERYDAY_SCENARIO } from './desktopEveryday';

const CYCLE_MS = 24000;

function at(timeMs: number): DemoTarget {
  return targetAt(DESKTOP_EVERYDAY_SCENARIO, timeMs);
}

function sceneStart(index: number): number {
  return DESKTOP_EVERYDAY_SCENARIO.scenes
    .slice(0, index)
    .reduce((total, scene) => total + scene.durationMs, 0);
}

function within(point: { x: number; y: number }, box: DOMRectLike): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

interface DOMRectLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

describe('геометрия десктопного меню', () => {
  it('число ячеек и пунктов в config совпадает с данными реплики', () => {
    expect(LAPTOP_MENU.reactionCount).toBe(QUICK_REACTIONS.length);
    expect(LAPTOP_MENU.itemCount).toBe(MESSAGE_MENU_ITEMS.length);
  });

  it('меню у нижнего края экрана переворачивается вверх и целиком помещается', () => {
    const origin = laptopMenuOrigin(LAPTOP_CURSOR.bubble.x, LAPTOP_CURSOR.bubble.y);
    expect(origin.top).toBe(LAPTOP_CURSOR.bubble.y - LAPTOP_MENU.height);
    expect(origin.top).toBeGreaterThanOrEqual(0);
    expect(origin.left + LAPTOP_MENU.width).toBeLessThanOrEqual(LAPTOP_LOGICAL.width);
  });

  it('меню у правого края экрана переворачивается влево', () => {
    const origin = laptopMenuOrigin(LAPTOP_LOGICAL.width - 10, 20);
    expect(origin.left).toBe(LAPTOP_LOGICAL.width - 10 - LAPTOP_MENU.width);
    expect(origin.top).toBe(20);
  });

  it('точка курсора для реакции лежит внутри своей ячейки', () => {
    const origin = laptopMenuOrigin(LAPTOP_CURSOR.bubble.x, LAPTOP_CURSOR.bubble.y);
    const index = QUICK_REACTIONS.indexOf(REACTION_EMOJI);
    const left = origin.left + LAPTOP_MENU.border + LAPTOP_MENU.padX + index * LAPTOP_MENU.reactionPitch;
    const top = origin.top + LAPTOP_MENU.border + LAPTOP_MENU.reactionPadY;
    expect(
      within(LAPTOP_CURSOR.reaction, {
        left,
        right: left + LAPTOP_MENU.reactionSize,
        top,
        bottom: top + LAPTOP_MENU.reactionSize,
      }),
    ).toBe(true);
  });
});

describe('десктопный сценарий А', () => {
  it('круг длится ровно 24 секунды', () => {
    expect(scenarioDuration(DESKTOP_EVERYDAY_SCENARIO)).toBe(CYCLE_MS);
  });

  it('все точки курсора остаются внутри логического экрана', () => {
    for (let timeMs = 0; timeMs < CYCLE_MS; timeMs += 50) {
      const frame = at(timeMs);
      expect(frame.cursorX).toBeGreaterThanOrEqual(0);
      expect(frame.cursorX).toBeLessThanOrEqual(LAPTOP_LOGICAL.width);
      expect(frame.cursorY).toBeGreaterThanOrEqual(0);
      expect(frame.cursorY).toBeLessThanOrEqual(LAPTOP_LOGICAL.height);
    }
  });

  it('шов круга невидим: всё, что видно на последнем кадре, совпадает с первым', () => {
    const seam = at(CYCLE_MS - 1);
    const start = at(0);
    expect(seam.cursorX).toBeCloseTo(start.cursorX, 1);
    expect(seam.cursorY).toBeCloseTo(start.cursorY, 1);
    expect(seam.chatsScroll).toBeCloseTo(start.chatsScroll, 1);
    expect(seam.screen).toBe(start.screen);
    expect(seam.search).toBe(start.search);
    expect(seam.pressed).toBe(start.pressed);
    expect(seam.overlay).toBe(start.overlay);
    expect(seam.hoverRow).toBe(start.hoverRow);
  });

  it('переписка обнуляется только под закрытой колонкой чата', () => {
    expect(at(CYCLE_MS - 1).visibleMessages).toBe(DIALOG_WITH_VOICE);
    expect(at(0).visibleMessages).toBe(DIALOG_BEFORE_REPLY);
    expect(at(CYCLE_MS - 1).screen).toBe('chats');
    expect(discreteOf(at(0)).screen).toBe('chats');
  });

  it('начинается с пустой колонки чата, без нажатий и без поиска', () => {
    const start = at(0);
    expect(start.screen).toBe('chats');
    expect(start.search).toBe(false);
    expect(start.pressed).toBeNull();
    expect(start.overlay).toBe('none');
    expect(start.hoverRow).toBeNull();
    expect(start.visibleMessages).toBe(DIALOG_BEFORE_REPLY);
  });

  it('список уезжает вниз, возвращается, строка Артёма подсвечивается под курсором', () => {
    expect(at(sceneStart(1)).chatsScroll).toBeGreaterThan(250);
    expect(at(sceneStart(2)).chatsScroll).toBeCloseTo(0);
    expect(at(sceneStart(2)).hoverRow).toBe('artem');
    expect(at(sceneStart(1) - 1).hoverRow).toBeNull();
  });

  it('курсор доезжает до строки чата раньше, чем по ней щёлкают', () => {
    const click = at(sceneStart(2));
    expect(click.cursorX).toBeCloseTo(LAPTOP_CURSOR.chatRow.x, 1);
    expect(click.cursorY).toBeCloseTo(LAPTOP_CURSOR.chatRow.y, 1);
    expect(click.pressed).toBe(PRESS.row);
  });

  it('щелчок держится и на время открытия чата, снимается после', () => {
    expect(at(sceneStart(3)).pressed).toBe(PRESS.row);
    expect(at(sceneStart(3)).screen).toBe('chat');
    expect(at(sceneStart(4) + 1).pressed).toBeNull();
  });

  it('меню открывается на «Тихо, без мучений» после нажатия на пузырь', () => {
    expect(at(sceneStart(5)).pressed).toBe(PRESS.bubble);
    expect(at(sceneStart(5)).overlay).toBe('none');
    const opened = at(sceneStart(6));
    expect(opened.overlay).toBe('menu');
    expect(opened.menuMessageId).toBe('m5');
    expect(opened.menuPick).toBeNull();
  });

  it('курсор доезжает до 😢 к тому кадру, где смайл подсвечен', () => {
    const picked = at(sceneStart(8) - 1);
    expect(picked.menuPick).toBe(REACTION_EMOJI);
    expect(picked.cursorX).toBeCloseTo(LAPTOP_CURSOR.reaction.x, 1);
    expect(picked.cursorY).toBeCloseTo(LAPTOP_CURSOR.reaction.y, 1);
  });

  it('меню закрывается, реакция садится на пузырь, курсор уходит к композеру', () => {
    expect(at(sceneStart(8)).overlay).toBe('none');
    const settled = at(sceneStart(10) - 1);
    expect(settled.menuMessageId).toBeNull();
    expect(settled.reactionMessageId).toBe('m5');
    expect(settled.cursorX).toBeCloseTo(LAPTOP_CURSOR.composer.x, 1);
  });

  it('набор идёт от нуля до полной фразы, кнопка отправки нажимается под курсором', () => {
    expect(at(sceneStart(11)).typing).toBeCloseTo(0);
    expect(at(sceneStart(12)).typing).toBeCloseTo(1);
    expect(at(sceneStart(12)).composerText).toBe(TYPED_MESSAGE);
    const send = at(sceneStart(13));
    expect(send.pressed).toBe(PRESS.send);
    expect(send.cursorX).toBeCloseTo(LAPTOP_CURSOR.send.x, 1);
    expect(send.cursorY).toBeCloseTo(LAPTOP_CURSOR.send.y, 1);
  });

  it('переписка наполняется до конца круга', () => {
    expect(at(sceneStart(14)).visibleMessages).toBe(DIALOG_WITH_OWN_REPLY);
    expect(at(sceneStart(16)).visibleMessages).toBe(DIALOG_WITH_PUNCHLINE);
    expect(at(sceneStart(17)).visibleMessages).toBe(DIALOG_WITH_ALBUM);
    expect(at(sceneStart(19)).visibleMessages).toBe(DIALOG_WITH_VOICE);
  });

  it('голосовое пишется, пока держат кнопку, и счётчик доходит до конца', () => {
    expect(at(sceneStart(18)).recording).toBe(true);
    expect(at(sceneStart(18)).pressed).toBe(PRESS.mic);
    expect(at(sceneStart(19) - 1).voice).toBeGreaterThan(0.99);
    expect(at(sceneStart(19)).recording).toBe(false);
  });

  it('вместо возврата в список курсор идёт к поиску и открывает панель', () => {
    const arrived = at(sceneStart(21));
    expect(arrived.cursorX).toBeCloseTo(LAPTOP_CURSOR.search.x, 1);
    expect(arrived.cursorY).toBeCloseTo(LAPTOP_CURSOR.search.y, 1);
    expect(arrived.pressed).toBe(PRESS.search);
    expect(at(sceneStart(22)).search).toBe(true);
    expect(at(sceneStart(23) - 1).search).toBe(true);
  });

  it('поиск закрывается, колонка чата пустеет, список возвращается к нулю', () => {
    const last = at(CYCLE_MS - 1);
    expect(last.search).toBe(false);
    expect(last.screen).toBe('chats');
    expect(last.chatsScroll).toBeCloseTo(0);
  });

  it('внутри круга ни один кадр не оставляет меню без сообщения', () => {
    for (let timeMs = 0; timeMs < CYCLE_MS; timeMs += 20) {
      const frame = at(timeMs);
      if (frame.overlay === 'menu') expect(frame.menuMessageId).not.toBeNull();
    }
  });
});
