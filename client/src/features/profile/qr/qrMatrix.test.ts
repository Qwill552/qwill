import { describe, expect, it } from 'vitest';

import {
  errorCorrectionCodewords,
  formatInformation,
  gfMultiply,
  gfPower,
  MASK_RULES,
  qrMatrix,
  reservedModules,
  type QrMatrix,
} from './qrMatrix';

const STANDARD_FORMAT_INFORMATION_M = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];

const SPECS = [
  { dataCodewords: 16, blocks: 1 },
  { dataCodewords: 28, blocks: 1 },
  { dataCodewords: 44, blocks: 1 },
  { dataCodewords: 64, blocks: 2 },
  { dataCodewords: 86, blocks: 2 },
  { dataCodewords: 108, blocks: 4 },
];

function at(matrix: QrMatrix, row: number, column: number): boolean {
  return matrix[row]?.[column] === true;
}

function versionOf(matrix: QrMatrix): number {
  return (matrix.length - 17) / 4;
}

function readFormatBits(matrix: QrMatrix): number {
  const bits: boolean[] = [];
  for (let i = 0; i <= 5; i += 1) bits[i] = at(matrix, i, 8);
  bits[6] = at(matrix, 7, 8);
  bits[7] = at(matrix, 8, 8);
  bits[8] = at(matrix, 8, 7);
  for (let i = 9; i < 15; i += 1) bits[i] = at(matrix, 8, 14 - i);
  return bits.reduce((value, bit, index) => value | (bit ? 1 << index : 0), 0);
}

function detectMask(matrix: QrMatrix): number {
  const bits = readFormatBits(matrix);
  const mask = MASK_RULES.findIndex((_rule, index) => formatInformation(index) === bits);
  expect(mask).toBeGreaterThanOrEqual(0);
  return mask;
}

function readCodewords(matrix: QrMatrix, mask: number): number[] {
  const size = matrix.length;
  const reserved = reservedModules(versionOf(matrix));
  const rule = MASK_RULES[mask]!;
  const bits: number[] = [];
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (reserved[row]?.[column] === true) continue;
        const value = rule(row, column) ? !at(matrix, row, column) : at(matrix, row, column);
        bits.push(value ? 1 : 0);
      }
    }
    upward = !upward;
  }

  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]!;
    codewords.push(byte);
  }
  return codewords;
}

function decode(matrix: QrMatrix): string {
  const spec = SPECS[versionOf(matrix) - 1]!;
  const stream = readCodewords(matrix, detectMask(matrix));
  const perBlock = spec.dataCodewords / spec.blocks;

  const bits: number[] = [];
  for (let block = 0; block < spec.blocks; block += 1) {
    for (let i = 0; i < perBlock; i += 1) {
      const byte = stream[i * spec.blocks + block]!;
      for (let shift = 7; shift >= 0; shift -= 1) bits.push((byte >> shift) & 1);
    }
  }
  const take = (count: number): number => bits.splice(0, count).reduce((value, bit) => (value << 1) | bit, 0);

  expect(take(4)).toBe(0b0100);
  const length = take(8);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = take(8);
  return new TextDecoder().decode(bytes);
}

describe('formatInformation', () => {
  it('совпадает со справочной таблицей уровня M', () => {
    expect(MASK_RULES.map((_rule, mask) => formatInformation(mask))).toEqual(STANDARD_FORMAT_INFORMATION_M);
  });
});

describe('errorCorrectionCodewords', () => {
  it('даёт кодовое слово, делящееся на порождающий многочлен', () => {
    const data = Uint8Array.from({ length: 16 }, (_value, index) => (index * 37 + 11) % 256);
    const codeword = [...data, ...errorCorrectionCodewords(data, 10)];

    for (let root = 0; root < 10; root += 1) {
      const point = gfPower(root);
      const value = codeword.reduce((accumulator, coefficient) => gfMultiply(accumulator, point) ^ coefficient, 0);
      expect(value).toBe(0);
    }
  });
});

describe('reservedModules', () => {
  it('оставляет под данные ровно столько модулей, сколько предписывает версия', () => {
    [208, 359, 567, 807].forEach((expected, index) => {
      const free = reservedModules(index + 1).reduce(
        (total, row) => total + row.filter((value) => !value).length,
        0,
      );
      expect(free).toBe(expected);
    });
  });
});

describe('qrMatrix', () => {
  const link = 'https://qwill.mooo.com/u/qwill';

  it('рисует поисковые узоры по трём углам', () => {
    const matrix = qrMatrix(link);
    const size = matrix.length;
    const corners: [number, number][] = [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ];

    for (const [top, left] of corners) {
      for (let row = 0; row < 7; row += 1) {
        for (let column = 0; column < 7; column += 1) {
          const distance = Math.max(Math.abs(row - 3), Math.abs(column - 3));
          expect(at(matrix, top + row, left + column)).toBe(distance !== 2);
        }
      }
    }
  });

  it('чередует синхрополосу и ставит тёмный модуль', () => {
    const matrix = qrMatrix(link);
    for (let i = 8; i < matrix.length - 8; i += 1) {
      expect(at(matrix, 6, i)).toBe(i % 2 === 0);
      expect(at(matrix, i, 6)).toBe(i % 2 === 0);
    }
    expect(at(matrix, matrix.length - 8, 8)).toBe(true);
  });

  it('читается обратно — короткая ссылка', () => {
    const matrix = qrMatrix(link);
    expect(versionOf(matrix)).toBe(3);
    expect(decode(matrix)).toBe(link);
  });

  it('читается обратно — самый длинный ник', () => {
    const longest = `https://dev.qwill.mooo.com/u/${'q'.repeat(32)}`;
    expect(decode(qrMatrix(longest))).toBe(longest);
  });

  it('читается обратно на каждой поддерживаемой версии', () => {
    for (const length of [1, 14, 26, 42, 62, 84, 106]) {
      const text = 'q'.repeat(length);
      expect(decode(qrMatrix(text))).toBe(text);
    }
  });

  it('не берёт версию больше нужного', () => {
    expect(versionOf(qrMatrix('q'.repeat(14)))).toBe(1);
    expect(versionOf(qrMatrix('q'.repeat(15)))).toBe(2);
    expect(versionOf(qrMatrix('q'.repeat(26)))).toBe(2);
    expect(versionOf(qrMatrix('q'.repeat(27)))).toBe(3);
  });

  it('отказывается от слишком длинной строки', () => {
    expect(() => qrMatrix('q'.repeat(107))).toThrow();
  });
});
