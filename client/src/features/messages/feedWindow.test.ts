import { describe, expect, it } from 'vitest';

import { mergeFeedPage, selectDeletedRows, trimFeedWindow, type FeedItem } from './feedWindow';

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
