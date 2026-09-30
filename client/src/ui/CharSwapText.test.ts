import { describe, expect, it } from 'vitest';

import { splitChange } from './CharSwapText';

describe('splitChange: посимвольная смена счётчика', () => {
  it('общие начало и конец стоят, меняется середина', () => {
    expect(splitChange('1 из 42', '2 из 42')).toEqual({ head: '', gone: '1', come: '2', tail: ' из 42' });
    expect(splitChange('19 из 42', '20 из 42')).toEqual({ head: '', gone: '19', come: '20', tail: ' из 42' });
    expect(splitChange('Выбрано 12', 'Выбрано 13')).toEqual({ head: 'Выбрано 1', gone: '2', come: '3', tail: '' });
  });

  it('разная длина: середина старой и новой строк разной ширины', () => {
    expect(splitChange('9 из 42', '10 из 42')).toEqual({ head: '', gone: '9', come: '10', tail: ' из 42' });
  });

  it('ничего общего — меняется вся строка', () => {
    expect(splitChange('Ищу…', '1 из 5')).toEqual({ head: '', gone: 'Ищу…', come: '1 из 5', tail: '' });
  });
});
