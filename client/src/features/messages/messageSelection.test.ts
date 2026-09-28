import { describe, expect, it } from 'vitest';

import { dragSelect, SELECTION_LIMIT, selectionCopyText, toggleIds } from './messageSelection';

function ids(set: ReadonlySet<number>): number[] {
  return [...set].sort((a, b) => a - b);
}

describe('toggleIds', () => {
  it('добавляет и снимает', () => {
    expect(ids(toggleIds(new Set([1]), [2]))).toEqual([1, 2]);
    expect(ids(toggleIds(new Set([1, 2]), [2]))).toEqual([1]);
  });

  it('альбом снимается целиком, только если выделен весь', () => {
    expect(ids(toggleIds(new Set([1, 2]), [2, 3]))).toEqual([1, 2, 3]);
    expect(ids(toggleIds(new Set([1, 2, 3]), [2, 3]))).toEqual([1]);
  });

  it('на пределе не добавляет, но снимает', () => {
    const full = new Set(Array.from({ length: SELECTION_LIMIT }, (_, index) => index + 1));
    expect(toggleIds(full, [999]).size).toBe(SELECTION_LIMIT);
    expect(toggleIds(full, [1]).size).toBe(SELECTION_LIMIT - 1);
    expect(SELECTION_LIMIT).toBe(50);
  });
});

describe('dragSelect', () => {
  it('протяжка добавляет диапазон, обратный ход возвращает к исходному', () => {
    const base = new Set([10]);
    expect(ids(dragSelect(base, [[1], [2], [3]], true))).toEqual([1, 2, 3, 10]);
    expect(ids(dragSelect(base, [[1]], true))).toEqual([1, 10]);
  });

  it('начатая на выделенном — снимает', () => {
    expect(ids(dragSelect(new Set([1, 2, 3, 4]), [[2], [3]], false))).toEqual([1, 4]);
  });

  it('упирается в предел от стартового', () => {
    const range = Array.from({ length: 80 }, (_, index) => [index + 1]);
    expect(dragSelect(new Set(), range, true).size).toBe(SELECTION_LIMIT);
  });
});

describe('selectionCopyText', () => {
  const ann = { id: 'a', displayName: 'Анна' };
  const bob = { id: 'b', displayName: 'Борис' };

  it('одно сообщение — без имени', () => {
    expect(selectionCopyText([{ id: 1, content: 'привет', sender: ann }])).toBe('привет');
  });

  it('по возрастанию id, через пустую строку, имя на смене автора', () => {
    const text = selectionCopyText([
      { id: 5, content: 'пять', sender: bob },
      { id: 1, content: 'один', sender: ann },
      { id: 3, content: 'три', sender: ann },
      { id: 4, content: null, sender: bob },
    ]);
    expect(text).toBe('Анна:\nодин\n\nтри\n\nБорис:\nпять');
  });

  it('ничего не копирует, если текста нет', () => {
    expect(selectionCopyText([{ id: 1, content: null, sender: ann }])).toBe('');
  });
});
