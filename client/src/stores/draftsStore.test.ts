import type { ChatListItemDto, MessageDto } from '@messenger/shared';
import { describe, expect, it } from 'vitest';

import { chatSortTime, nextDrafts, shownDraft } from './draftsStore';

const reply = { id: 7, content: 'вопрос' } as MessageDto;

function chat(lastAt: number, unreadCount = 0): ChatListItemDto {
  const iso = new Date(lastAt).toISOString();
  return { id: 'c', lastMessage: { createdAt: iso } as MessageDto, updatedAt: iso, unreadCount } as ChatListItemDto;
}

describe('nextDrafts', () => {
  it('пустой без ответа удаляется', () => {
    const saved = nextDrafts({}, 'c1', 'текст', null, 1);
    expect(nextDrafts(saved, 'c1', '   ', null, 2)).toEqual({});
  });

  it('один ответ без текста держится', () => {
    expect(nextDrafts({}, 'c1', '', reply, 1).c1?.replyTo?.id).toBe(7);
  });

  it('тот же черновик не двигает дату', () => {
    const saved = nextDrafts({}, 'c1', 'текст', reply, 1000);
    expect(nextDrafts(saved, 'c1', 'текст', reply, 5000)).toBe(saved);
    expect(nextDrafts(saved, 'c1', 'текст!', reply, 5000).c1?.date).toBe(5000);
  });
});

describe('shownDraft', () => {
  const draft = { text: 'текст', replyTo: null, date: 1_000_000 };

  it('показывается вместо сообщения', () => {
    expect(shownDraft(chat(500_000), draft)).toBe(draft);
  });

  it('скрыт, если новое сообщение и есть непрочитанные', () => {
    expect(shownDraft(chat(2_000_000, 1), draft)).toBeNull();
    expect(shownDraft(chat(2_000_000, 0), draft)).toBe(draft);
  });

  it('пустой без ответа не показывается', () => {
    expect(shownDraft(chat(500_000), { text: ' ', replyTo: null, date: 1_000_000 })).toBeNull();
  });

  it('сортировка — по большей из двух дат', () => {
    expect(chatSortTime(chat(1_000_000), { text: 'x', replyTo: null, date: 5_000_000 })).toBe(5_000_000);
    expect(chatSortTime(chat(9_000_000), { text: 'x', replyTo: null, date: 5_000_000 })).toBe(9_000_000);
  });
});
