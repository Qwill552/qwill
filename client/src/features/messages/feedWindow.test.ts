import { describe, expect, it } from 'vitest';

import {
  boundsAround,
  clampBounds,
  mergeFeedPage,
  sameBounds,
  selectDeletedRows,
  shiftBounds,
  tailBounds,
  trimFeedWindow,
  type FeedBounds,
  type FeedItem,
} from './feedWindow';

function feed(...ids: number[]): FeedItem[] {
  return ids.map((id) => ({ id }));
}

function ids(list: FeedItem[]): number[] {
  return list.map((item) => item.id);
}

describe('склейка страниц ленты', () => {
  it('старая страница встаёт перед лентой', () => {
    expect(ids(mergeFeedPage(feed(5, 6), feed(3, 4), 'older'))).toEqual([3, 4, 5, 6]);
  });

  it('новая страница встаёт перед неотправленным, а не после него', () => {
    expect(ids(mergeFeedPage(feed(5, -1), feed(6, 7), 'newer'))).toEqual([5, 6, 7, -1]);
  });

  it('уже известные сообщения не дублируются', () => {
    expect(ids(mergeFeedPage(feed(5, 6), feed(4, 5, 6), 'older'))).toEqual([4, 5, 6]);
  });

  it('страница целиком из известного оставляет ленту той же самой', () => {
    const list = feed(5, 6);
    expect(mergeFeedPage(list, feed(5, 6), 'older')).toBe(list);
  });
});

describe('скользящий срез ленты', () => {
  const limit = 6;

  it('лента короче предела не режется', () => {
    const list = feed(1, 2, 3);
    expect(trimFeedWindow(list, 'older', limit, { keepFromId: 1, keepToId: 3 })).toEqual({
      list,
      trimmed: false,
    });
  });

  it('без известной видимой области не режется ничего', () => {
    const list = feed(1, 2, 3, 4, 5, 6, 7, 8);
    expect(trimFeedWindow(list, 'older', limit, null).trimmed).toBe(false);
  });

  it('догрузка вверх отрезает дальний низ и оставляет срез сплошным', () => {
    const result = trimFeedWindow(feed(1, 2, 3, 4, 5, 6, 7, 8), 'older', limit, {
      keepFromId: 2,
      keepToId: 4,
    });

    expect(result.trimmed).toBe(true);
    expect(ids(result.list)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('догрузка вниз отрезает дальний верх', () => {
    const result = trimFeedWindow(feed(1, 2, 3, 4, 5, 6, 7, 8), 'newer', limit, {
      keepFromId: 5,
      keepToId: 7,
    });

    expect(result.trimmed).toBe(true);
    expect(ids(result.list)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('видимая область не режется, даже если лента длиннее предела', () => {
    const result = trimFeedWindow(feed(1, 2, 3, 4, 5, 6, 7, 8), 'older', limit, {
      keepFromId: 1,
      keepToId: 8,
    });

    expect(result.trimmed).toBe(false);
    expect(ids(result.list)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('неотправленное с низа ленты не срезается', () => {
    const result = trimFeedWindow(feed(1, 2, 3, 4, 5, 6, 7, -1), 'older', limit, {
      keepFromId: 1,
      keepToId: 2,
    });

    expect(result.trimmed).toBe(false);
    expect(ids(result.list)).toEqual([1, 2, 3, 4, 5, 6, 7, -1]);
  });
});

describe('границы среза рендера', () => {
  const limit = 6;
  const list = feed(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

  it('хвост накопителя приклеен к низу и держит размер среза', () => {
    const bounds = tailBounds(list, limit);

    expect(bounds).toEqual({ fromId: 5, toId: null });
    expect(clampBounds(list, bounds, limit)).toEqual({ from: 4, to: 9 });
  });

  it('лента короче предела вся целиком в срезе', () => {
    const short = feed(1, 2, 3);

    expect(tailBounds(short, limit)).toEqual({ fromId: null, toId: null });
    expect(clampBounds(short, { fromId: null, toId: null }, limit)).toEqual({ from: 0, to: 2 });
  });

  it('окно вокруг сообщения не создаёт дыр и не выходит за края', () => {
    expect(clampBounds(list, boundsAround(list, 5, limit), limit)).toEqual({ from: 1, to: 6 });
    expect(clampBounds(list, boundsAround(list, 1, limit), limit)).toEqual({ from: 0, to: 5 });
    expect(clampBounds(list, boundsAround(list, 10, limit), limit)).toEqual({ from: 4, to: 9 });
  });

  it('окно вокруг незагруженного сообщения падает на хвост', () => {
    expect(boundsAround(list, 99, limit)).toEqual(tailBounds(list, limit));
  });

  it('расширение вверх сдвигает срез, не меняя его размера', () => {
    const bounds = shiftBounds(list, tailBounds(list, limit), 'older', 2, limit);

    expect(bounds).toEqual({ fromId: 3, toId: 8 });
    expect(clampBounds(list, bounds, limit)).toEqual({ from: 2, to: 7 });
  });

  it('расширение не выходит за пределы накопителя и приклеивается к краю', () => {
    const top = shiftBounds(list, { fromId: 3, toId: 8 }, 'older', 10, limit);
    expect(top).toEqual({ fromId: null, toId: 6 });

    const bottom = shiftBounds(list, { fromId: null, toId: 6 }, 'newer', 10, limit);
    expect(bottom).toEqual({ fromId: 5, toId: null });
  });

  it('на самом краю расширение оставляет границы прежними', () => {
    const top = { fromId: null, toId: 6 };
    expect(sameBounds(shiftBounds(list, top, 'older', 2, limit), top)).toBe(true);

    const tail = tailBounds(list, limit);
    expect(sameBounds(shiftBounds(list, tail, 'newer', 2, limit), tail)).toBe(true);
  });

  it('приклеенный к низу срез сам вбирает пришедшее живое сообщение', () => {
    const bounds = tailBounds(list, limit);
    const grown = [...list, ...feed(11)];

    expect(clampBounds(grown, bounds, limit)).toEqual({ from: 5, to: 10 });
  });

  it('приклеенный к верху срез вбирает догруженную сверху страницу', () => {
    const bounds: FeedBounds = { fromId: null, toId: 16 };
    const grown = feed(8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20);

    expect(clampBounds(grown, bounds, limit)).toEqual({ from: 0, to: 5 });
  });

  it('исчезнувшая граница берётся по ближайшему соседу', () => {
    const gap = feed(1, 2, 5, 6, 7, 8);

    expect(clampBounds(gap, { fromId: 3, toId: 7 }, limit)).toEqual({ from: 2, to: 4 });
  });

  it('неотправленное с конца ленты не путает границы хвоста', () => {
    const withPending = [...list, ...feed(-1)];

    expect(clampBounds(withPending, { fromId: null, toId: null }, limit)).toEqual({ from: 5, to: 10 });
  });
});

describe('строки, ушедшие из среза', () => {
  const rows = [
    { key: 'a', groupIds: [1] },
    { key: 'b', groupIds: [2, 3] },
    { key: 'c', groupIds: [4] },
  ];

  function keys(list: typeof rows): string[] {
    return list.map((row) => row.key);
  }

  it('строка, чьё сообщение осталось в накопителе, удалённой не считается', () => {
    const deleted = selectDeletedRows(rows, feed(1, 2, 3, 4), (row) => row.groupIds);

    expect(deleted).toEqual([]);
  });

  it('удалённой считается только та, чьих сообщений в накопителе больше нет', () => {
    const deleted = selectDeletedRows(rows, feed(1, 4), (row) => row.groupIds);

    expect(keys(deleted)).toEqual(['b']);
  });

  it('альбом жив, пока в накопителе есть хоть один его снимок', () => {
    const deleted = selectDeletedRows(rows, feed(3), (row) => row.groupIds);

    expect(keys(deleted)).toEqual(['a', 'c']);
  });

  it('пустой список возвращается как есть, накопитель не перебирается', () => {
    expect(selectDeletedRows([], feed(1, 2), (row: { groupIds: number[] }) => row.groupIds)).toEqual([]);
  });
});
