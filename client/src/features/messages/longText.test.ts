import { describe, expect, it } from 'vitest';

import { splitLongText } from './longText';

const a = (n: number) => 'а'.repeat(n);
const b = (n: number) => 'б'.repeat(n);

describe('splitLongText', () => {
  it('предел и меньше не режет', () => {
    expect(splitLongText(a(4096))).toEqual([a(4096)]);
    expect(splitLongText('  коротко  ')).toEqual(['коротко']);
  });

  it('режет сначала по пустой строке', () => {
    const parts = splitLongText(`${a(3900)}\n\n${b(50)}\n${'в'.repeat(50)} ${'г'.repeat(500)}`);
    expect(parts[0]).toBe(a(3900));
    expect(parts[1]!.startsWith('б')).toBe(true);
  });

  it('без пустой строки — по переводу строки', () => {
    expect(splitLongText(`${a(4000)}\n${b(200)}`)).toEqual([a(4000), b(200)]);
  });

  it('пробел после точки раньше голого пробела', () => {
    const parts = splitLongText(`${a(3900)}. ${b(100)} ${'в'.repeat(200)}`);
    expect(parts[0]).toBe(`${a(3900)}.`);
    expect(parts[1]).toBe(`${b(100)} ${'в'.repeat(200)}`);
  });

  it('иначе — по пробелу', () => {
    expect(splitLongText(`${a(4000)} ${b(200)}`)).toEqual([a(4000), b(200)]);
  });

  it('ищет не дальше 300 знаков назад, дальше режет ровно по пределу', () => {
    expect(splitLongText(`${a(3796)} ${b(1000)}`)[0]).toHaveLength(3796);
    expect(splitLongText(`${a(3795)} ${b(1000)}`)[0]).toHaveLength(4096);
  });

  it('части обрезаны от пробелов', () => {
    expect(splitLongText(`${a(4090)}      \n\n     ${b(10)}`)).toEqual([a(4090), b(10)]);
  });

  it('суррогатную пару не разрезает', () => {
    const parts = splitLongText(`${a(4095)}😀${b(10)}`);
    expect(parts[0]).toHaveLength(4095);
    expect(parts[1]!.startsWith('😀')).toBe(true);
  });
});
