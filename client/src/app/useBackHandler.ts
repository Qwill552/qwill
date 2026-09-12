import { useEffect, useRef } from 'react';

let openOverlays = 0;
let nextEntryId = 0;

/** Системный жест «назад» при открытом оверлее ведёт сам оверлей: шторка едет за пальцем
 *  ровно так же, как при перетаскивании вниз, и уезжает на `invoke`. Раньше ScreenStack
 *  просто отказывался вести жест (`hasOpenOverlay`), и палец у края не делал ничего
 *  видимого до самого отпускания (R-33A, замечание пользователя). */
export interface OverlayBackGesture {
  progress: (ratio: number) => void;
  settle: (committed: boolean) => void;
}

const overlayGestures: OverlayBackGesture[] = [];

export function registerOverlayBackGesture(handler: OverlayBackGesture): () => void {
  overlayGestures.push(handler);
  return () => {
    const at = overlayGestures.indexOf(handler);
    if (at >= 0) overlayGestures.splice(at, 1);
  };
}

export function topOverlayBackGesture(): OverlayBackGesture | null {
  return overlayGestures[overlayGestures.length - 1] ?? null;
}

/** Пока открыт хотя бы один оверлей, у него уже есть собственный полноэкранный скрим —
 *  зона свайпа «назад» у левого края физически под ним, так что ScreenStack просто
 *  не должен запускать свой жест поверх. */
export function hasOpenOverlay(): boolean {
  return openOverlays > 0;
}

/**
 * Единая точка закрытия оверлеев жестом «назад» и аппаратной кнопкой (ux-ui/02-shell.md).
 * Открытие оверлея добавляет служебную запись в историю; «назад» — жест или системная
 * кнопка — эту запись выталкивает: приходит popstate, оверлей закрывается, а не уводит
 * с экрана. Любой будущий оверлей регистрируется этим же хуком вместо собственного
 * обработчика popstate.
 */
export function useBackHandler(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // React StrictMode в dev прогоняет mount→cleanup→mount синхронно на каждом монтировании.
  // history.back() асинхронен: если гасить запись «в лоб» из cleanup, результат может
  // долететь уже после повторного mount и попасть в его слушатель popstate, закрывая
  // оверлей, который только что открылся заново. generation держит это под контролем —
  // отложенная отмена применяется только если за тик не пришёл более новый mount.
  //
  // entryId метит именно эту запись истории. Раньше отложенное закрытие проверяло только
  // «есть ли вообще qwillOverlay-запись сверху» — если за тот же тик успевал открыться
  // следующий оверлей (например, «Переслать» из закрывающегося контекстного меню сообщения:
  // оба используют этот хук синхронно в одном рендере), cleanup закрывающегося меню находил
  // сверху уже ЧУЖУЮ, свежепришедшую запись и гасил её вместо своей — новый оверлей мгновенно
  // закрывался сам собой, а openOverlays у него больше никогда не decrement'ился (его
  // handlePopState уже увидел state.pushed=false и не в счёт), что навсегда блокировало
  // hasOpenOverlay() и вместе с ним свайп «назад» (ux-ui.md, журнал, этап 6). Теперь
  // history.back() зовётся только если запись на вершине истории — действительно наша.
  const stateRef = useRef({ generation: 0, pushed: false, entryId: -1 });

  useEffect(() => {
    if (!isOpen) return;
    const state = stateRef.current;
    const myGeneration = ++state.generation;

    if (!state.pushed) {
      state.pushed = true;
      state.entryId = ++nextEntryId;
      openOverlays += 1;
      // Служебная запись наследует состояние текущей: react-router держит в history.state
      // свои `idx`/`key`/`usr` и по ним считает позицию в истории. Затерев их пустым
      // объектом, оверлей ломал его учёт (idx становился null, а следующая настоящая
      // навигация нумеровалась с нуля) и заодно лишал запись ключа локации.
      window.history.pushState({ ...window.history.state, qwillOverlay: true, entryId: state.entryId }, '');
    }

    function ourEntryIsStillCurrent(): boolean {
      return window.history.state?.entryId === state.entryId;
    }

    function handlePopState(): void {
      if (ourEntryIsStillCurrent()) return;
      state.pushed = false;
      openOverlays = Math.max(0, openOverlays - 1);
      onCloseRef.current();
    }

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      setTimeout(() => {
        if (state.generation !== myGeneration) return; // подхвачено более новым mount
        if (!state.pushed) return; // уже закрыто через popstate
        state.pushed = false;
        openOverlays = Math.max(0, openOverlays - 1);
        // Закрыли не через «назад» (тап по скриму, кнопка Х) — служебная запись осталась
        // висеть в истории, гасим её сами, иначе первый настоящий «назад» уйдёт в никуда.
        // Но только если сверху всё ещё наша запись — если поверх уже успел открыться
        // следующий оверлей, его запись трогать нельзя, own decrement выше уже сделан.
        if (window.history.state?.entryId === state.entryId) window.history.back();
      }, 0);
    };
  }, [isOpen]);
}
