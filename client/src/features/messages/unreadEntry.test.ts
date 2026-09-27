import { describe, expect, it } from 'vitest';

import { decideUnreadEntry, firstUnreadAfter, READ_MIN_INTERVAL_MS, ReadTracker, unreadBetween } from './unreadEntry';

const ME = 'me';
const PEER = 'peer';

function m(id: number, sender: string = PEER) {
  return { id, sender: { id: sender } };
}

function clock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    timers: {
      now: () => now,
      setTimeout: (run: () => void, ms: number) => {
        const handle = next++;
        timers.set(handle, { at: now + ms, run });
        return handle;
      },
      clearTimeout: (handle: number) => {
        timers.delete(handle);
      },
    },
    advance(ms: number) {
      now += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.at > now) continue;
        timers.delete(handle);
        timer.run();
      }
    },
  };
}

describe('где открыть чат с непрочитанными', () => {
  it('без непрочитанных — как обычно', () => {
    expect(decideUnreadEntry([m(1), m(2)], true, 0, 1, ME)).toEqual({ kind: 'none' });
  });

  it('загруженный хвост доходит до курсора — якорь на первом чужом после него', () => {
    expect(decideUnreadEntry([m(10), m(11, ME), m(12), m(13)], true, 2, 11, ME)).toEqual({ kind: 'anchor', messageId: 12 });
    expect(decideUnreadEntry([m(10, ME), m(11), m(12)], true, 2, 10, ME)).toEqual({ kind: 'anchor', messageId: 11 });
  });

  it('начало истории загружено целиком — якорь, даже если курсор старше всего', () => {
    expect(decideUnreadEntry([m(5), m(6)], false, 2, 0, ME)).toEqual({ kind: 'anchor', messageId: 5 });
  });

  it('непрочитанное глубже хвоста — страница после курсора', () => {
    expect(decideUnreadEntry([m(50), m(51)], true, 30, 20, ME)).toEqual({ kind: 'load', after: 20 });
  });

  it('курсор уже на последнем — счётчик устарел, открываем внизу', () => {
    expect(decideUnreadEntry([m(1), m(2)], true, 3, 2, ME)).toEqual({ kind: 'none' });
  });

  it('неотправленное не считается', () => {
    expect(firstUnreadAfter([m(-1), m(3, ME), m(4)], 0, ME)).toBe(4);
    expect(unreadBetween([m(1), m(2, ME), m(3), m(-1)], ME, 0, 3)).toBe(2);
    expect(unreadBetween([m(1), m(2)], ME, 2, 9)).toBe(0);
  });
});

describe('отметка прочитанного по ходу чтения', () => {
  it('курсор только растёт', () => {
    const sent: number[] = [];
    const time = clock();
    const tracker = new ReadTracker((id) => sent.push(id), time.timers);
    expect(tracker.seen(10)).toBe(true);
    expect(tracker.seen(8)).toBe(false);
    expect(tracker.seen(10)).toBe(false);
    expect(sent).toEqual([10]);
  });

  it('не чаще раза в 500 мс, последнее досылается', () => {
    const sent: number[] = [];
    const time = clock();
    const tracker = new ReadTracker((id) => sent.push(id), time.timers);
    tracker.seen(1);
    tracker.seen(2);
    tracker.seen(3);
    expect(sent).toEqual([1]);
    time.advance(READ_MIN_INTERVAL_MS - 1);
    expect(sent).toEqual([1]);
    time.advance(1);
    expect(sent).toEqual([1, 3]);
  });

  it('уход досылает отложенное, известный курсор не отправляется повторно', () => {
    const sent: number[] = [];
    const time = clock();
    const tracker = new ReadTracker((id) => sent.push(id), time.timers);
    tracker.know(20);
    expect(tracker.seen(15)).toBe(false);
    expect(tracker.seen(-4)).toBe(false);
    tracker.seen(21);
    tracker.seen(25);
    tracker.flush();
    expect(sent).toEqual([21, 25]);
    time.advance(1000);
    expect(sent).toEqual([21, 25]);
  });
});
