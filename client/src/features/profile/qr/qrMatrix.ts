export type QrMatrix = readonly (readonly boolean[])[];

interface VersionSpec {
  dataCodewords: number;
  ecCodewordsPerBlock: number;
  blocks: number;
}

const VERSION_SPECS: readonly VersionSpec[] = [
  { dataCodewords: 16, ecCodewordsPerBlock: 10, blocks: 1 },
  { dataCodewords: 28, ecCodewordsPerBlock: 16, blocks: 1 },
  { dataCodewords: 44, ecCodewordsPerBlock: 26, blocks: 1 },
  { dataCodewords: 64, ecCodewordsPerBlock: 18, blocks: 2 },
  { dataCodewords: 86, ecCodewordsPerBlock: 24, blocks: 2 },
  { dataCodewords: 108, ecCodewordsPerBlock: 16, blocks: 4 },
];

const BYTE_MODE = 0b0100;
const HEADER_BITS = 4 + 8;
const PAD_CODEWORDS = [0xec, 0x11];
const ERROR_CORRECTION_M_BITS = 0b00;
const FORMAT_GENERATOR = 0x537;
const FORMAT_MASK = 0x5412;

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

for (let i = 0, value = 1; i < 255; i += 1) {
  GF_EXP[i] = value;
  GF_LOG[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255]!;

export function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

export function gfPower(exponent: number): number {
  return GF_EXP[exponent % 255]!;
}

function generatorPolynomial(degree: number): Uint8Array {
  let poly = Uint8Array.of(1);
  for (let step = 0; step < degree; step += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let i = 0; i < poly.length; i += 1) {
      next[i] = next[i]! ^ poly[i]!;
      next[i + 1] = next[i + 1]! ^ gfMultiply(poly[i]!, GF_EXP[step]!);
    }
    poly = next;
  }
  return poly;
}

export function errorCorrectionCodewords(data: Uint8Array, count: number): Uint8Array {
  const generator = generatorPolynomial(count);
  const remainder = new Uint8Array(count);
  for (const byte of data) {
    const factor = byte ^ remainder[0]!;
    remainder.copyWithin(0, 1);
    remainder[count - 1] = 0;
    for (let i = 0; i < count; i += 1) remainder[i] = remainder[i]! ^ gfMultiply(generator[i + 1]!, factor);
  }
  return remainder;
}

export function formatInformation(maskPattern: number): number {
  const data = (ERROR_CORRECTION_M_BITS << 3) | maskPattern;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * FORMAT_GENERATOR);
  }
  return ((data << 10) | remainder) ^ FORMAT_MASK;
}

function specFor(byteLength: number): { version: number; spec: VersionSpec } {
  const version = VERSION_SPECS.findIndex((spec) => spec.dataCodewords * 8 >= HEADER_BITS + byteLength * 8) + 1;
  if (version === 0) throw new Error('Строка слишком длинная для QR-кода');
  return { version, spec: VERSION_SPECS[version - 1]! };
}

function encodeCodewords(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const capacityBits = spec.dataCodewords * 8;
  const bits: number[] = [];
  const pushBits = (value: number, width: number): void => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  pushBits(BYTE_MODE, 4);
  pushBits(bytes.length, 8);
  for (const byte of bytes) pushBits(byte, 8);

  const terminator = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminator; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const filled = bits.length / 8;
  const codewords = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < filled; i += 1) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i * 8 + j]!;
    codewords[i] = byte;
  }
  for (let i = filled; i < spec.dataCodewords; i += 1) {
    codewords[i] = PAD_CODEWORDS[(i - filled) % 2]!;
  }
  return codewords;
}

function interleave(dataCodewords: Uint8Array, spec: VersionSpec): Uint8Array {
  const perBlock = spec.dataCodewords / spec.blocks;
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let i = 0; i < spec.blocks; i += 1) {
    const block = dataCodewords.subarray(i * perBlock, (i + 1) * perBlock);
    dataBlocks.push(block);
    ecBlocks.push(errorCorrectionCodewords(block, spec.ecCodewordsPerBlock));
  }

  const result = new Uint8Array(spec.dataCodewords + spec.ecCodewordsPerBlock * spec.blocks);
  let at = 0;
  for (let i = 0; i < perBlock; i += 1) {
    for (const block of dataBlocks) {
      result[at] = block[i]!;
      at += 1;
    }
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i += 1) {
    for (const block of ecBlocks) {
      result[at] = block[i]!;
      at += 1;
    }
  }
  return result;
}

interface Canvas {
  modules: boolean[][];
  reserved: boolean[][];
  size: number;
}

function createCanvas(version: number): Canvas {
  const size = 17 + 4 * version;
  return {
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    size,
  };
}

function fillArea(
  canvas: Canvas,
  top: number,
  left: number,
  side: number,
  paint: (row: number, column: number) => boolean,
): void {
  for (let row = Math.max(top, 0); row < Math.min(top + side, canvas.size); row += 1) {
    for (let column = Math.max(left, 0); column < Math.min(left + side, canvas.size); column += 1) {
      canvas.modules[row]![column] = paint(row - top, column - left);
      canvas.reserved[row]![column] = true;
    }
  }
}

function drawFinder(canvas: Canvas, top: number, left: number): void {
  fillArea(canvas, top - 1, left - 1, 9, (row, column) => {
    const distance = Math.max(Math.abs(row - 4), Math.abs(column - 4));
    return distance !== 2 && distance !== 4;
  });
}

function drawAlignment(canvas: Canvas, centerRow: number, centerColumn: number): void {
  fillArea(canvas, centerRow - 2, centerColumn - 2, 5, (row, column) => {
    return Math.max(Math.abs(row - 2), Math.abs(column - 2)) !== 1;
  });
}

function drawFunctionPatterns(canvas: Canvas, version: number): void {
  const far = canvas.size - 7;
  drawFinder(canvas, 0, 0);
  drawFinder(canvas, 0, far);
  drawFinder(canvas, far, 0);

  for (let i = 8; i < canvas.size - 8; i += 1) {
    const dark = i % 2 === 0;
    canvas.modules[6]![i] = dark;
    canvas.reserved[6]![i] = true;
    canvas.modules[i]![6] = dark;
    canvas.reserved[i]![6] = true;
  }

  const centers = version === 1 ? [] : [6, 4 * version + 10];
  for (const row of centers) {
    for (const column of centers) {
      if (canvas.reserved[row]![column]) continue;
      drawAlignment(canvas, row, column);
    }
  }

  for (let i = 0; i <= 8; i += 1) {
    canvas.reserved[8]![i] = true;
    canvas.reserved[i]![8] = true;
  }
  for (let i = 0; i < 8; i += 1) {
    canvas.reserved[8]![canvas.size - 1 - i] = true;
    canvas.reserved[canvas.size - 1 - i]![8] = true;
  }
  canvas.modules[canvas.size - 8]![8] = true;
}

export function reservedModules(version: number): readonly (readonly boolean[])[] {
  const canvas = createCanvas(version);
  drawFunctionPatterns(canvas, version);
  return canvas.reserved;
}

function placeCodewords(canvas: Canvas, codewords: Uint8Array): void {
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  let upward = true;

  for (let right = canvas.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < canvas.size; step += 1) {
      const row = upward ? canvas.size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (canvas.reserved[row]![column]) continue;
        if (bitIndex < totalBits) {
          const byte = codewords[bitIndex >> 3]!;
          canvas.modules[row]![column] = ((byte >> (7 - (bitIndex & 7))) & 1) === 1;
        }
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

export const MASK_RULES: readonly ((row: number, column: number) => boolean)[] = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0,
];

function applyMask(canvas: Canvas, maskPattern: number): void {
  const rule = MASK_RULES[maskPattern]!;
  for (let row = 0; row < canvas.size; row += 1) {
    const modules = canvas.modules[row]!;
    const reserved = canvas.reserved[row]!;
    for (let column = 0; column < canvas.size; column += 1) {
      if (reserved[column]) continue;
      if (rule(row, column)) modules[column] = !modules[column];
    }
  }
}

function drawFormat(canvas: Canvas, maskPattern: number): void {
  const bits = formatInformation(maskPattern);
  const bitAt = (index: number): boolean => ((bits >> index) & 1) === 1;
  const size = canvas.size;

  for (let i = 0; i <= 5; i += 1) canvas.modules[i]![8] = bitAt(i);
  canvas.modules[7]![8] = bitAt(6);
  canvas.modules[8]![8] = bitAt(7);
  canvas.modules[8]![7] = bitAt(8);
  for (let i = 9; i < 15; i += 1) canvas.modules[8]![14 - i] = bitAt(i);

  for (let i = 0; i < 8; i += 1) canvas.modules[8]![size - 1 - i] = bitAt(i);
  for (let i = 8; i < 15; i += 1) canvas.modules[size - 15 + i]![8] = bitAt(i);
}

function runPenalty(line: readonly boolean[]): number {
  let penalty = 0;
  let runLength = 1;
  for (let i = 1; i < line.length; i += 1) {
    if (line[i] === line[i - 1]) {
      runLength += 1;
      continue;
    }
    if (runLength >= 5) penalty += 3 + (runLength - 5);
    runLength = 1;
  }
  if (runLength >= 5) penalty += 3 + (runLength - 5);
  return penalty;
}

const FINDER_LIKE = [true, false, true, true, true, false, true, false, false, false, false];

function finderLikePenalty(line: readonly boolean[]): number {
  let penalty = 0;
  for (let start = 0; start + FINDER_LIKE.length <= line.length; start += 1) {
    const forward = FINDER_LIKE.every((value, offset) => line[start + offset] === value);
    const backward = FINDER_LIKE.every((value, offset) => line[start + FINDER_LIKE.length - 1 - offset] === value);
    if (forward || backward) penalty += 40;
  }
  return penalty;
}

export function maskPenalty(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let penalty = 0;
  let dark = 0;

  for (const line of modules) {
    penalty += runPenalty(line) + finderLikePenalty(line);
    for (const value of line) if (value) dark += 1;
  }

  for (let column = 0; column < size; column += 1) {
    const line = modules.map((row) => row[column] === true);
    penalty += runPenalty(line) + finderLikePenalty(line);
  }

  for (let row = 0; row + 1 < size; row += 1) {
    const top = modules[row]!;
    const bottom = modules[row + 1]!;
    for (let column = 0; column + 1 < size; column += 1) {
      const value = top[column];
      if (top[column + 1] === value && bottom[column] === value && bottom[column + 1] === value) penalty += 3;
    }
  }

  penalty += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return penalty;
}

export function qrMatrix(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const { version, spec } = specFor(bytes.length);

  const base = createCanvas(version);
  drawFunctionPatterns(base, version);
  placeCodewords(base, interleave(encodeCodewords(bytes, spec), spec));

  let best = base.modules;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let maskPattern = 0; maskPattern < MASK_RULES.length; maskPattern += 1) {
    const canvas: Canvas = {
      modules: base.modules.map((row) => [...row]),
      reserved: base.reserved,
      size: base.size,
    };
    applyMask(canvas, maskPattern);
    drawFormat(canvas, maskPattern);
    const penalty = maskPenalty(canvas.modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = canvas.modules;
    }
  }
  return best;
}
