declare module 'gifenc' {
  export interface GIFEncoderWriteFrameOptions {
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    palette?: number[][] | null;
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GIFEncoderInstance {
    reset(): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GIFEncoderWriteFrameOptions): void;
  }

  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): GIFEncoderInstance;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: 'rgb565' | 'rgba4444' | 'rgb444' },
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: 'rgb565' | 'rgba4444' | 'rgb444',
  ): Uint8Array;
}
