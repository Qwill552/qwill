import { describe, expect, it } from 'vitest';

import { shouldFollowTail, type FollowTailInput } from './feedFollow';

const VIEWPORT = 800;
const RESERVE = 140;
const BUBBLE = 90;

function atBottom(scrollHeight: number): number {
  return scrollHeight - VIEWPORT;
}

function input(patch: Partial<FollowTailInput> = {}): FollowTailInput {
  const prevScrollHeight = 5000;
  const scrollHeight = prevScrollHeight + BUBBLE;
  return {
    lastId: 42,
    prevLastId: 41,
    liveMessageId: 42,
    isOwnLast: false,
    wasNewest: true,
    isAutoScrolling: false,
    scrollHeight,
    prevScrollHeight,
    scrollTop: atBottom(prevScrollHeight),
    clientHeight: VIEWPORT,
    bottomReserve: RESERVE,
    stickThreshold: 120,
    ...patch,
  };
}

describe('прилипание ленты к новому сообщению', () => {
  it('стоял внизу — едет за чужим сообщением', () => {
    expect(shouldFollowTail(input())).toBe(true);
  });

  it('стоял на пиксель выше низа — всё равно едет', () => {
    expect(shouldFollowTail(input({ scrollTop: atBottom(5000) - 1 }))).toBe(true);
  });

  it('запас под композер не считается уходом вверх', () => {
    expect(shouldFollowTail(input({ scrollTop: atBottom(5000) - RESERVE + 10 }))).toBe(true);
  });

  it('ушёл вверх на экран — не едет', () => {
    expect(shouldFollowTail(input({ scrollTop: atBottom(5000) - VIEWPORT }))).toBe(false);
  });

  it('высота пришедшего пузыря не отклеивает от низа', () => {
    const prevScrollHeight = 5000;
    const tall = 900;
    expect(
      shouldFollowTail(
        input({
          prevScrollHeight,
          scrollHeight: prevScrollHeight + tall,
          scrollTop: atBottom(prevScrollHeight),
        }),
      ),
    ).toBe(true);
  });

  it('ничего не пришло — не едет', () => {
    expect(shouldFollowTail(input({ lastId: 41 }))).toBe(false);
  });

  it('хвост не в окне — не едет даже стоя внизу', () => {
    expect(shouldFollowTail(input({ wasNewest: false }))).toBe(false);
  });
});

describe('своё сообщение', () => {
  it('тянет ленту вниз откуда угодно', () => {
    expect(
      shouldFollowTail(input({ isOwnLast: true, lastId: -1, liveMessageId: -1, scrollTop: 0 })),
    ).toBe(true);
  });

  it('но только когда это правда отправка, а не догрузка истории', () => {
    expect(
      shouldFollowTail(input({ isOwnLast: true, lastId: 900, liveMessageId: 0, scrollTop: 0 })),
    ).toBe(false);
  });
});

describe('зона прогрузки', () => {
  it('догруженная страница не тянет вниз человека, читающего историю', () => {
    const prevScrollHeight = 5000;
    const page = 3000;
    expect(
      shouldFollowTail(
        input({
          lastId: 700,
          prevLastId: 650,
          liveMessageId: 0,
          prevScrollHeight,
          scrollHeight: prevScrollHeight + page,
          scrollTop: atBottom(prevScrollHeight) - VIEWPORT * 3,
        }),
      ),
    ).toBe(false);
  });

  it('догруженная страница, у которой последним оказалось своё сообщение, тоже не тянет', () => {
    const prevScrollHeight = 5000;
    const page = 3000;
    expect(
      shouldFollowTail(
        input({
          isOwnLast: true,
          lastId: 700,
          prevLastId: 650,
          liveMessageId: 0,
          prevScrollHeight,
          scrollHeight: prevScrollHeight + page,
          scrollTop: atBottom(prevScrollHeight) - VIEWPORT * 3,
        }),
      ),
    ).toBe(false);
  });

  it('а стоящего внизу догрузка снизу за собой ведёт', () => {
    const prevScrollHeight = 5000;
    const page = 3000;
    expect(
      shouldFollowTail(
        input({
          lastId: 700,
          prevLastId: 650,
          liveMessageId: 0,
          prevScrollHeight,
          scrollHeight: prevScrollHeight + page,
          scrollTop: atBottom(prevScrollHeight),
        }),
      ),
    ).toBe(true);
  });
});

describe('очередь сообщений подряд', () => {
  it('второе сообщение догоняет ещё не доигравшую прокрутку', () => {
    const prevScrollHeight = 5000;
    expect(
      shouldFollowTail(
        input({
          lastId: 43,
          prevLastId: 42,
          liveMessageId: 43,
          isAutoScrolling: true,
          prevScrollHeight,
          scrollHeight: prevScrollHeight + BUBBLE,
          scrollTop: atBottom(prevScrollHeight) - 400,
        }),
      ),
    ).toBe(true);
  });

  it('но недоигравшая прокрутка не оправдывает догрузку истории', () => {
    const prevScrollHeight = 5000;
    expect(
      shouldFollowTail(
        input({
          lastId: 700,
          prevLastId: 650,
          liveMessageId: 0,
          isAutoScrolling: true,
          prevScrollHeight,
          scrollHeight: prevScrollHeight + 3000,
          scrollTop: atBottom(prevScrollHeight) - VIEWPORT * 3,
        }),
      ),
    ).toBe(false);
  });
});
