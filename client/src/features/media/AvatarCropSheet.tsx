import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cropGifToAvatarFile, cropImageToAvatarFile, isGifFile } from '../../api/files';
import { DesktopScreenModal } from '../../app/DesktopScreenModal';
import { useLayoutMode } from '../../app/useLayoutMode';
import { Sheet } from '../../ui/Sheet';
import styles from './AvatarCropSheet.module.css';

interface AvatarCropSheetProps {
  file: File;
  onClose: () => void;
  onCropped: (cropped: File) => void;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

interface Pointer {
  x: number;
  y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };
/** Множитель на один «щелчок» колеса (~100px deltaY) — подобрано на ощупь под пинч-жест. */
const WHEEL_SENSITIVITY = 0.0015;

function summarize(pointers: Map<number, Pointer>): { x: number; y: number; spread: number } {
  const points = [...pointers.values()];
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const [first, second] = points;
  const spread = first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
  return { x, y, spread };
}

export function AvatarCropSheet({ file, onClose, onCropped }: AvatarCropSheetProps) {
  const desktop = useLayoutMode() === 'desktop';
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Pointer>());

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [frameSize, setFrameSize] = useState(0);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const loaded = new Image();
    loaded.onload = () => {
      setImage(loaded);
      setImageUrl(url);
      setTransform(IDENTITY);
    };
    loaded.onerror = () => setError('Не удалось прочитать изображение');
    loaded.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    setFrameSize(node.clientWidth);
    const observer = new ResizeObserver(() => setFrameSize(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, [image]);

  const baseScale = image && frameSize ? frameSize / Math.min(image.naturalWidth, image.naturalHeight) : 0;

  function clampTransform(next: Transform): Transform {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    if (!image || !baseScale) return { ...next, scale };
    const limitX = Math.max(0, (image.naturalWidth * baseScale * scale - frameSize) / 2);
    const limitY = Math.max(0, (image.naturalHeight * baseScale * scale - frameSize) / 2);
    return {
      scale,
      x: Math.min(limitX, Math.max(-limitX, next.x)),
      y: Math.min(limitY, Math.max(-limitY, next.y)),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const active = pointers.current;
    if (!active.has(event.pointerId)) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;

    const before = summarize(active);
    active.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = summarize(active);

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    setTransform((current) => {
      const ratio = before.spread > 0 && after.spread > 0 ? after.spread / before.spread : 1;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * ratio));
      const applied = scale / current.scale;
      return clampTransform({
        scale,
        x: after.x - centerX - (before.x - centerX - current.x) * applied,
        y: after.y - centerY - (before.y - centerY - current.y) * applied,
      });
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /** Пинч недоступен мыши — колесо повторяет ту же математику зума от точки, только с одним
   *  «пальцем», зафиксированным под курсором. */
  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    if (!image) return;
    event.preventDefault();
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const pointerX = event.clientX - centerX;
    const pointerY = event.clientY - centerY;
    const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY);

    setTransform((current) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      const applied = scale / current.scale;
      return clampTransform({
        scale,
        x: pointerX - (pointerX - current.x) * applied,
        y: pointerY - (pointerY - current.y) * applied,
      });
    });
  }

  async function handleDone(): Promise<void> {
    if (!image || !baseScale || pending) return;
    setPending(true);
    setError(null);
    try {
      const shown = baseScale * transform.scale;
      const side = frameSize / shown;
      const x = Math.max(0, Math.min(image.naturalWidth - side, image.naturalWidth / 2 - transform.x / shown - side / 2));
      const y = Math.max(
        0,
        Math.min(image.naturalHeight - side, image.naturalHeight / 2 - transform.y / shown - side / 2),
      );
      const rect = { x, y, width: side, height: side };
      onCropped(isGifFile(file) ? await cropGifToAvatarFile(file, rect) : await cropImageToAvatarFile(image, rect));
    } catch {
      setError('Не удалось обрезать изображение');
      setPending(false);
    }
  }

  const body = (
    <>
      <div className={styles.stage} data-no-back-swipe>
        <div
          ref={frameRef}
          className={styles.frame}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          {image && imageUrl && (
            <img
              className={styles.image}
              src={imageUrl}
              alt=""
              draggable={false}
              style={{
                width: image.naturalWidth * baseScale,
                height: image.naturalHeight * baseScale,
                transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              }}
            />
          )}
        </div>
      </div>

      <p className={styles.hint}>
        {desktop
          ? 'Перетащите фото мышью, масштабируйте колесом'
          : 'Двигайте фото пальцем, масштабируйте щипком'}
      </p>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={onClose}>
          Отмена
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => void handleDone()}
          disabled={!image || pending}
        >
          Готово
        </button>
      </div>
    </>
  );

  if (desktop) {
    return (
      <DesktopScreenModal chromeless title="Кадрирование" onClose={onClose}>
        <div className={styles.desktopPad}>{body}</div>
      </DesktopScreenModal>
    );
  }

  return (
    <Sheet title="Кадрирование" onClose={onClose}>
      {body}
    </Sheet>
  );
}
