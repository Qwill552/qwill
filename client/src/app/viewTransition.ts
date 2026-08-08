/** Круговое раскрытие темы — тот же приём, которым переключается тема в Telegram:
 *  — на ночную (grow): новое состояние растёт кругом из точки нажатия поверх старого;
 *  — на дневную (shrink): старое стягивается в точку, открывая новое под собой.
 *
 *  Реализовано своим слоем поверх приложения, а не через View Transitions API. От API пришлось
 *  отказаться: его псевдоэлементы рисуются в «snapshot containing block» — прямоугольнике
 *  размером с вьюпорт при убранной выдвижной хроме браузера, — из-за чего на мобильном Chrome
 *  круг уезжал вверх на высоту адресной строки и не доставал до дальнего угла, а первое за время
 *  жизни страницы нажатие вдобавок ловило гонку навешивания анимации на псевдоэлемент. Перебрано
 *  и отвергнуто: поправка координат на 100lvh, element.animate({pseudoElement}), кейфреймы через
 *  var() на :root, сгенерированный <style>, холостой «прогревочный» переход (см. журнал ux-ui.md).
 *  Обычный DOM-элемент анимируется как любой другой, и десктоп с телефоном ведут себя одинаково —
 *  но круг ему задаётся только в процентах, не в пикселях (почему — см. комментарий ниже).
 *
 *  Как получается «два состояния сразу»: слой — глубокая копия содержимого <body> с выставленной
 *  на нём противоположной темой. Токены темы наследуются, поэтому ближайший предок с data-theme
 *  перекрывает их для всего поддерева (селекторы без :root в tokens.css).
 *
 *  mutate() в обоих направлениях применяется СРАЗУ — состояние приложения не должно ждать конца
 *  анимации (иначе подпись пункта меню меняется через полсекунды после того, как круг доехал):
 *  — shrink: копия снимается до мутации, поэтому несёт старое состояние, и стягивается, открывая
 *    под собой уже новое;
 *  — grow: мутация делается синхронно (flushSync), чтобы React успел перерисоваться ДО снятия
 *    копии — тогда копия несёт уже новое состояние и растёт поверх. Настоящему интерфейсу под ней
 *    на время анимации возвращается старая тема: иначе новое росло бы по новому и круга не было
 *    бы видно. Точка нажатия — центр круга, то есть сам пункт меню накрывается копией с первого
 *    же кадра, и подпись на нём меняется в начале анимации, а не после неё. */

import { flushSync } from 'react-dom';

const DURATION_MS = 650;
const EASE = 'cubic-bezier(.22,1,.36,1)';

/** Активная анимация: повторное нажатие (меню не закрывается, keepOpen) не должно накладывать
 *  два слоя друг на друга — предыдущий доигрывается мгновенно и убирается. */
let running: (() => void) | null = null;

/** cloneNode не переносит ни позицию прокрутки, ни фазу CSS-анимаций. Без первого список чатов
 *  в копии оказался бы прокручен в начало, без второго — капли фона (AmbientBlobs) прыгнули бы
 *  на старт своего цикла ровно в момент раскрытия. */
function syncLiveState(source: Element, clone: Element): void {
  const from = [source, ...source.querySelectorAll('*')];
  const to = [clone, ...clone.querySelectorAll('*')];
  for (let i = 0; i < from.length && i < to.length; i += 1) {
    const src = from[i];
    const dst = to[i];
    if (!src || !dst) continue;

    if (src.scrollTop || src.scrollLeft) {
      dst.scrollTop = src.scrollTop;
      dst.scrollLeft = src.scrollLeft;
    }

    const srcAnim = src.getAnimations()[0];
    const dstAnim = dst.getAnimations()[0];
    if (srcAnim && dstAnim && srcAnim.currentTime !== null) dstAnim.currentTime = srcAnim.currentTime;
  }
}

export function revealTransition(x: number, y: number, toDark: boolean, mutate: () => void): void {
  running?.();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    mutate();
    return;
  }

  const html = document.documentElement;
  const oldTheme = html.dataset.theme === 'dark' ? 'dark' : 'light';
  const newTheme = toDark ? 'dark' : 'light';

  // grow: мутация до снятия копии и синхронно, чтобы копия несла уже новое состояние (см. шапку).
  if (toDark) flushSync(mutate);

  const layer = document.createElement('div');
  layer.className = 'theme-reveal-layer';
  layer.setAttribute('aria-hidden', 'true');
  // grow — копия показывает новую тему, shrink — старую (см. шапку файла).
  layer.dataset.theme = toDark ? newTheme : oldTheme;

  // Предварительная обрезка — до вставки в документ: иначе первый же кадр показал бы копию
  // целиком, то есть вспышку противоположной темы на весь экран. Настоящие числа ставятся ниже,
  // промежуточной отрисовки между этим и тем нет — всё происходит в одной синхронной задаче.
  layer.style.clipPath = toDark ? 'circle(0% at 0% 0%)' : 'none';

  const pairs: [Element, Element][] = [];
  for (const child of Array.from(document.body.children)) {
    const clone = child.cloneNode(true);
    if (!(clone instanceof HTMLElement)) continue;
    // id у копии НЕ снимаем: на нём держится её раскладка. В tokens.css есть
    // `html, body, #root { height: 100dvh }` — без id копия остаётся без высоты, `.shell`
    // резолвит свои `height: 100%` от auto, и всё содержимое схлопывается в ноль: в круге
    // видна одна заливка --bg вместо интерфейса. Дубль id живёт ровно на время анимации,
    // а getElementById и так вернёт настоящий узел — слой добавлен последним.
    layer.appendChild(clone);
    pairs.push([child, clone]);
  }

  document.body.appendChild(layer);
  // Только теперь: у неприсоединённого поддерева нет ни лэйаута (scrollTop не применился бы),
  // ни запущенных CSS-анимаций (getAnimations() вернул бы пусто).
  for (const [src, dst] of pairs) syncLiveState(src, dst);

  if (toDark) {
    // Настоящий интерфейс под копией на время анимации держим в старой теме — иначе новое
    // росло бы по новому. Вернём в новую в finish().
    html.dataset.theme = oldTheme;
  } else {
    // shrink: под стягивающейся копией должно быть уже новое состояние.
    mutate();
  }

  // Круг задаётся ТОЛЬКО в процентах, без единого абсолютного пикселя. Абсолютные длины внутри
  // clip-path на тестовом телефоне резолвились в своей системе координат и промахивались мимо
  // точки нажатия стабильно кратно ~devicePixelRatio (круг уезжал к левому верхнему углу), хотя
  // те же самые пиксели в left/top обычного элемента ложились точно — проверено пробной точкой.
  // Проценты считаются от собственного бокса элемента, поэтому дают одну и ту же ОТНОСИТЕЛЬНУЮ
  // точку при любом масштабе и сдвиге этой системы координат: слой накрывает вьюпорт целиком,
  // значит доля от вьюпорта равна доле от слоя.
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cxPct = (x / w) * 100;
  const cyPct = (y / h) * 100;

  // Радиус в процентах у circle() резолвится не от ширины и не от высоты, а от диагонали,
  // делённой на √2 (CSS Shapes, «reference length»). Отношение двух длин от масштаба не зависит.
  const referenceLength = Math.hypot(w, h) / Math.SQRT2;
  const endRadius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  const radiusPct = (endRadius / referenceLength) * 100;

  const point = `at ${cxPct}% ${cyPct}%`;
  const hidden = `circle(0% ${point})`;
  const covering = `circle(${radiusPct}% ${point})`;
  layer.style.clipPath = toDark ? hidden : covering;

  const animation = layer.animate(
    [{ clipPath: toDark ? hidden : covering }, { clipPath: toDark ? covering : hidden }],
    { duration: DURATION_MS, easing: EASE, fill: 'forwards' },
  );

  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    running = null;
    animation.cancel();
    layer.remove();
    // grow: снимаем временный откат темы — копия уже закрыла собой весь экран, под ней
    // ровно то же новое состояние, поэтому подмены не видно.
    if (toDark) html.dataset.theme = newTheme;
  };

  running = finish;
  animation.finished.then(finish).catch(() => finish());
}
