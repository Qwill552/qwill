export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function fitDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function drawScaled(
  source: CanvasImageSource,
  rect: SourceRect,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
  return canvas;
}

export function downscaleInSteps(
  source: CanvasImageSource,
  rect: SourceRect,
  target: { width: number; height: number },
): HTMLCanvasElement {
  let current = source;
  let currentRect = rect;

  while (currentRect.width > target.width * 2 && currentRect.height > target.height * 2) {
    const width = Math.max(target.width, Math.round(currentRect.width / 2));
    const height = Math.max(target.height, Math.round(currentRect.height / 2));
    current = drawScaled(current, currentRect, width, height);
    currentRect = { x: 0, y: 0, width, height };
  }

  return drawScaled(current, currentRect, target.width, target.height);
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Не удалось создать превью'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    image.src = url;
  });
}
