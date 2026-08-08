import { useLayoutEffect, useRef } from 'react';

import styles from './AmbientBlobs.module.css';

/** Настоящий слой капель — тот, что лежит в AppShell под всем содержимым. Копии
 *  (сейчас одна — внутри раскрытой панели поиска) равняются по нему фазой. */
let primaryLayer: HTMLDivElement | null = null;

interface AmbientBlobsProps {
  /** Копия слоя, а не сам канвас: панель поиска непрозрачна и закрывает собой
   *  настоящие капли, поэтому рисует их у себя заново. Такая копия монтируется
   *  позже, и её `@keyframes blob` начались бы с нуля, тогда как настоящие капли
   *  уже в середине своих 18/22/26-секундных циклов. Замерено в момент открытия:
   *  копия `scale(1.002) translate(0.45, -0.34)` против оригинала
   *  `scale(1.147) translate(39.2, -29.4)` — из-за чего фон на верхней кромке
   *  панели обрывался и уходил на четверть темнее ровно под капсулой поиска
   *  («свечение возле капсулы исчезает»). Флаг включает подгонку фазы. */
  secondary?: boolean;
}

/** Канвас вкладок: сплошная заливка --bg плюс три размытых цветных пятна. Единственное
 *  место, которое красит фон авторизованной части приложения — экраны в ScreenStack и их
 *  обёртки нарочно прозрачны (см. комментарий в ScreenStack.module.css), иначе капли были
 *  бы не видны ни на одной вкладке. Аватар чата (ChatScreen) поверх своих обоев — исключение,
 *  капли под ними не нужны. */
export function AmbientBlobs({ secondary = false }: AmbientBlobsProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    if (!secondary) {
      primaryLayer = layer;
      return () => {
        if (primaryLayer === layer) primaryLayer = null;
      };
    }

    // Переносим текущее время анимации с настоящих капель на копию — поэлементно,
    // потому что у трёх пятен разные длительности и разные базовые задержки.
    // Не пересчитываем фазу арифметикой: `currentTime` — то самое значение, которым
    // браузер и рисует кадр, поэтому копия встаёт ровно в ту же точку цикла.
    const source = primaryLayer?.children;
    if (!source) return;
    for (let i = 0; i < layer.children.length; i += 1) {
      // prefers-reduced-motion гасит анимацию совсем — тогда синхронизировать нечего.
      const from = source[i]?.getAnimations()[0];
      const to = layer.children[i]?.getAnimations()[0];
      if (from && to && from.currentTime !== null) to.currentTime = from.currentTime;
    }
  }, [secondary]);

  return (
    <div className={styles.layer} ref={layerRef} aria-hidden="true">
      <span className={`${styles.blob} ${styles.blobBlue}`} />
      <span className={`${styles.blob} ${styles.blobViolet}`} />
      <span className={`${styles.blob} ${styles.blobTeal}`} />
    </div>
  );
}
