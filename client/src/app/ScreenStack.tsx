import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
} from 'react';
import {
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  type Location,
} from 'react-router-dom';

import { AppearanceScreen } from '../pages/AppearanceScreen';
import { CallTraceScreen } from '../pages/CallTraceScreen';
import { ChatInfoScreen } from '../pages/ChatInfoScreen';
import { ChatScreen } from '../pages/ChatScreen';
import { ChatsScreen } from '../pages/ChatsScreen';
import { ContactsScreen } from '../pages/ContactsScreen';
import { DeveloperScreen } from '../pages/DeveloperScreen';
import { ProfileScreen } from '../pages/ProfileScreen';
import { SettingsScreen } from '../pages/SettingsScreen';
import { StubScreen } from '../pages/StubScreen';
import {
  applyDesktopListWidth,
  clampDesktopListWidth,
  DESKTOP_LIST_WIDTH_DEFAULT,
  useDesktopColumnsStore,
} from '../stores/desktopColumnsStore';
import { ChatInfoCard } from '../features/chat/ChatInfoCard';
import { DesktopScreenModal } from './DesktopScreenModal';
import { EmptyChatColumn } from './EmptyChatColumn';
import { hasOpenOverlay } from './useBackHandler';
import { useLayoutMode } from './useLayoutMode';
import { isTabRoot, parentPathOf, tabOf, transitionKind, type TransitionKind } from './routing';
import { lastPathForTab, rememberTabPath } from './tabNav';
import styles from './ScreenStack.module.css';

interface SwipePoint {
  x: number;
  y: number;
  timeStamp: number;
}

const MOUSE_EDGE_ZONE = 32;
const BACK_SWIPE_LOCK_PX = 10;
const BACK_SWIPE_DOMINANCE = 2;
const DRAG_WATCHDOG_MS = 4000;
/** Порог срабатывания: доля ширины экрана — буквально 0.4 из bindSwipe. */
const POP_THRESHOLD = 0.4;
/** Скорость броска, px/мс — референсовые 5.5 px/16мс-кадр, переведённые в px/мс. */
const POP_VELOCITY = 0.344;

/** «Вглубь» (push) — буквально animateOpen: .44s, референсовый easing. Назад по нав-триггеру
 *  (клик по кнопке «назад», не жест) — buttons() → finish(0.34), другой easing. */
const PUSH_MS = 440;
const PUSH_EASE = 'cubic-bezier(.22,1,.36,1)';
const POP_MS = 340;
const POP_EASE = 'cubic-bezier(.32,0,.22,1)';
/** Жест отпущен, но не пересёк порог — settle(): пружинный возврат. */
const SETTLE_MS = 420;
const SETTLE_EASE = 'cubic-bezier(.18,1.1,.32,1)';

function emptyLocation(pathname: string): Location {
  return { pathname, search: '', hash: '', state: null, key: 'preview' };
}

const CHATS_ROOT_LOCATION = emptyLocation('/chats');

/** Заголовок карточки DesktopScreenModal — по вкладке верхнего уровня, не по конкретному
 *  подмаршруту: «Оформление»/«Для разработчиков» показывают свой заголовок сами, через
 *  собственный ChromeBar (StubScreen/AppearanceScreen), эта строка — «имя окна». */
const OVERLAY_TAB_TITLE: Record<string, string> = {
  contacts: 'Контакты',
  settings: 'Настройки',
  profile: 'Мой профиль',
};

const RESIZE_STEP = 16;
const RESIZE_STEP_LARGE = 48;

/** Экраны стека — обе анимируемые прослойки (уходящая/приходящая) рисуют один и тот же
 *  набор маршрутов с разным `location`, отсюда и живой предпросмотр экрана под пальцем
 *  при свайпе «назад»: он использует настоящий компонент, а не фейковую картинку. */
const RouteSwitch = memo(
  function RouteSwitch({ location }: { location: Location }) {
    return (
      <Routes location={location}>
        <Route path="/chats" element={<ChatsScreen />} />
        <Route path="/chats/:chatId" element={<ChatScreen />} />
        <Route path="/chats/:chatId/info" element={<ChatInfoScreen />} />
        <Route path="/contacts" element={<ContactsScreen />} />
        <Route
          path="/contacts/:userId"
          element={<StubScreen title="Контакт" backTo="/contacts" />}
        />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/settings/appearance" element={<AppearanceScreen />} />
        <Route path="/settings/developer" element={<DeveloperScreen />} />
        <Route path="/settings/developer/call-trace" element={<CallTraceScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="*" element={<Navigate to="/chats" replace />} />
      </Routes>
    );
  },
  (prev, next) => prev.location.pathname === next.location.pathname,
);

type AnimKind = 'push' | 'pop';
type Layer = 'from' | 'to';

interface AnimState {
  kind: AnimKind;
  from: Location;
  /** null — «уезжающий» слой уже стал настоящим маршрутом (displayLocation); заполняется
   *  только во время интерактивного свайпа, пока навигация ещё не случилась. */
  to: Location | null;
  progress: number;
  transition: boolean;
  mode: 'nav' | 'drag';
  durationMs: number;
  easing: string;
}

/** «Открытость» вложенного экрана: 0 — он закрыт (корень нормальный), 1 — открыт (корень
 *  сдвинут). Буквально rootShift(p) из референса, p = 1-openness при открытии и openness при
 *  закрытии — здесь наоборот собрано в одну переменную, которую делят оба слоя. */
function openness(kind: AnimKind, progress: number): number {
  return kind === 'push' ? progress : 1 - progress;
}

/** true — этот физический слой (from/to) сейчас играет роль вложенного экрана (буквально
 *  {{hasChat}}: translateX 100%→0, поверх всего); false — роль корня-таб-контента под ним
 *  (rootShift: сдвиг −22%, сжатие до .955, притемнение до .55 brightness). */
function isOverlayLayer(kind: AnimKind, layer: Layer): boolean {
  return (kind === 'push' && layer === 'to') || (kind === 'pop' && layer === 'from');
}

function layerTransform(kind: AnimKind, layer: Layer, progress: number): string {
  const o = openness(kind, progress);
  if (isOverlayLayer(kind, layer)) return `translateX(${(100 * (1 - o)).toFixed(2)}%)`;
  return `translateX(${(-22 * o).toFixed(2)}%) scale(${(1 - 0.045 * o).toFixed(4)})`;
}

function scrimOpacity(kind: AnimKind, layer: Layer, progress: number): string {
  if (isOverlayLayer(kind, layer)) return '0';
  return (0.45 * openness(kind, progress)).toFixed(3);
}

function layerStyle(anim: AnimState, layer: Layer): CSSProperties {
  return {
    zIndex: isOverlayLayer(anim.kind, layer) ? 2 : 1,
    transform: layerTransform(anim.kind, layer, anim.progress),
    transition: anim.transition ? `transform ${anim.durationMs}ms ${anim.easing}` : 'none',
    willChange: 'transform',
  };
}

/** Притемнение корня под открытым вложенным экраном — буквально та же доля (.45), что и
 *  прежний `filter:brightness()` на самом слое, но отдельным непрозрачным слоем поверх него,
 *  а не фильтром на предке. `filter` на предке заставляет браузер на каждый кадр анимации
 *  расплющивать (rasterize) все дочерние compositing-слои — а с этапа 2 их под рукой у чата
 *  десятки (блюр у каждого пузыря, шапки, композера), из-за чего и свайп «назад», и переход
 *  в профиль собеседника заметно тормозили, а стекло на следующем экране «доезжало» с
 *  задержкой (ChatsScreen после свайпа назад, ChatInfoScreen после перехода из чата). */
function scrimStyle(anim: AnimState, layer: Layer): CSSProperties {
  return {
    opacity: scrimOpacity(anim.kind, layer, anim.progress),
    transition: anim.transition ? `opacity ${anim.durationMs}ms ${anim.easing}` : 'none',
  };
}

const TAB_ANIM_STYLE: CSSProperties = { willChange: 'transform' };

/** Оболочка стека экранов: переход «вглубь» — новый экран въезжает справа поверх всего, старый
 *  под ним сдвигается и притемняется (rootShift); между вкладками — боковой сдвиг на 76px без
 *  второго слоя (референс не рисует уходящий экран вообще — sc-if размонтирует его мгновенно).
 *  Плюс интерактивный свайп «назад» от левого края (ux-ui/gestures.md). */
export function ScreenStack() {
  const location = useLocation();
  const navigate = useNavigate();
  /** 'POP' — шаг по истории, то есть аппаратная кнопка «назад» (или «вперёд») браузера;
   *  'PUSH'/'REPLACE' — навигация изнутри приложения. Нужен только там, где родство путей
   *  не читается (см. transitionKind). */
  const navigationType = useNavigationType();
  const layout = useLayoutMode();
  const stackRef = useRef<HTMLDivElement>(null);
  const fromLayerRef = useRef<HTMLDivElement>(null);
  const toLayerRef = useRef<HTMLDivElement>(null);
  const fromScrimRef = useRef<HTMLDivElement>(null);
  const toScrimRef = useRef<HTMLDivElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const listColumnRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    available: number;
    width: number;
  } | null>(null);

  const [displayLocation, setDisplayLocation] = useState<Location>(location);
  const [anim, setAnim] = useState<AnimState | null>(null);
  const [tabAnim, setTabAnim] = useState<'forward' | 'back' | null>(null);

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    progress: number;
    width: number;
    parentPath: string;
    crossed: boolean;
  } | null>(null);
  const backSwipeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    taken: boolean;
  } | null>(null);
  const pendingCommit = useRef<string | null>(null);
  /** Дозор на случай, если `transitionend` не придёт вовсе (см. armFallback ниже). */
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackToken = useRef(0);

  useEffect(() => {
    rememberTabPath(location.pathname);
  }, [location.pathname]);

  useEffect(() => () => clearFallback(), []);

  useEffect(() => cancelDragFrame, []);

  useLayoutEffect(() => {
    const drag = dragRef.current;
    if (drag?.active) paintDrag(drag.progress, null);
  });

  function paintDrag(progress: number, motion: { durationMs: number; easing: string } | null): void {
    if (!fromLayerRef.current || !toLayerRef.current) return;
    const parts: [HTMLDivElement | null, HTMLDivElement | null, Layer][] = [
      [fromLayerRef.current, fromScrimRef.current, 'from'],
      [toLayerRef.current, toScrimRef.current, 'to'],
    ];
    for (const [layerNode, scrimNode, layer] of parts) {
      if (layerNode) {
        layerNode.style.transition = motion ? `transform ${motion.durationMs}ms ${motion.easing}` : 'none';
        layerNode.style.transform = layerTransform('pop', layer, progress);
      }
      if (scrimNode) {
        scrimNode.style.transition = motion ? `opacity ${motion.durationMs}ms ${motion.easing}` : 'none';
        scrimNode.style.opacity = scrimOpacity('pop', layer, progress);
      }
    }
  }

  function cancelDragFrame(): void {
    if (dragFrameRef.current === null) return;
    cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
  }

  function scheduleDragFrame(): void {
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const drag = dragRef.current;
      if (!drag?.active) return;
      paintDrag(drag.progress, null);
    });
  }

  function clearFallback(): void {
    if (fallbackTimer.current !== null) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  }

  /** Снять дозор от ПРЕДЫДУЩЕГО перехода перед началом нового: иначе его срабатывание
   *  (оно приходит по времени старого перехода) обнулило бы уже чужую, только что заведённую
   *  анимацию. */
  function cancelFallback(): void {
    clearFallback();
    fallbackToken.current += 1;
  }

  /** Жест может довести `progress` до 0 или 1 ещё ДО отпускания (палец у самого края или
   *  не сдвинулся вовсе) — тогда commit/settle на pointerup выставляют то же самое значение,
   *  `transform` не меняется, браузер не шлёт `transitionend`, и finishAnim повисает: анимация
   *  считается активной вечно, новый свайп не запускается, URL не переключается (баг:
   *  «дотянул чат до края, но не отпустил — потом не переключает»). Таймер-дозор гарантирует
   *  завершение перехода даже без события. */
  function armFallback(durationMs: number): void {
    const token = ++fallbackToken.current;
    clearFallback();
    fallbackTimer.current = setTimeout(() => {
      if (fallbackToken.current !== token) return;
      finishAnim();
    }, durationMs + 80);
  }

  function armDragWatchdog(): void {
    const token = ++fallbackToken.current;
    clearFallback();
    fallbackTimer.current = setTimeout(() => {
      if (fallbackToken.current !== token) return;
      if (backSwipeRef.current?.taken) {
        armDragWatchdog();
        return;
      }
      finishAnim();
    }, DRAG_WATCHDOG_MS);
  }

  function finishAnim(): void {
    clearFallback();
    fallbackToken.current += 1;
    setAnim((current) => {
      if (!current) return current;
      if (current.mode === 'drag') {
        const target = pendingCommit.current;
        pendingCommit.current = null;
        if (target) {
          setDisplayLocation(emptyLocation(target));
          navigate(target);
        }
      }
      return null;
    });
  }

  // Настоящая навигация (клик, программный navigate) — запускает таймированный переход.
  useEffect(() => {
    if (layout === 'desktop') {
      pendingCommit.current = null;
      cancelFallback();
      setAnim(null);
      setTabAnim(null);
      setDisplayLocation(location);
      return;
    }

    if (location.pathname === displayLocation.pathname) {
      if (location !== displayLocation) setDisplayLocation(location);
      return;
    }

    const kind: TransitionKind = transitionKind(
      displayLocation.pathname,
      location.pathname,
      navigationType === 'POP' ? 'pop' : 'push',
    );

    cancelFallback();

    if (kind === 'tab-forward' || kind === 'tab-back') {
      // Смена вкладки не рисует второй слой — и обязана снять чужой, если он ещё висит.
      // Слой «вглубь/наружу» уходит вместе с ключом (см. рендер: key={toLocation.pathname}),
      // то есть его transitionend уже никогда не придёт, и незакрытый anim остался бы
      // навсегда: старый экран так и висел бы под новым сдвинутым и притемнённым слоем
      // («наложение интерфейса»), а свайп «назад» перестал бы стартовать вовсе (beginDrag
      // выходит, пока anim не null).
      pendingCommit.current = null;
      setAnim(null);
      setDisplayLocation(location);
      setTabAnim(kind === 'tab-forward' ? 'forward' : 'back');
      return;
    }

    const from = displayLocation;
    const durationMs = kind === 'push' ? PUSH_MS : POP_MS;
    const easing = kind === 'push' ? PUSH_EASE : POP_EASE;
    // Зеркально: боковой сдвиг вкладки на приходящем слое (CSS-анимация .tabForward/.tabBack)
    // перебивает inline-transform этого перехода, потому что анимация в каскаде сильнее
    // инлайна — приходящий экран поехал бы не оттуда, откуда должен.
    setTabAnim(null);
    setAnim({ kind, from, to: null, progress: 0, transition: false, mode: 'nav', durationMs, easing });
    setDisplayLocation(location);

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnim((a) => (a && a.mode === 'nav' ? { ...a, progress: 1, transition: true } : a));
        // Тот же дозор, что и у жеста (см. armFallback): transitionend может не прийти вовсе —
        // например, приходящий слой размонтируют раньше конца анимации, — и без него anim
        // остался бы навсегда.
        armFallback(durationMs);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [location, layout]);

  function handleAnimEnd(event: TransitionEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) return;
    if (!anim) return;
    finishAnim();
  }

  function beginDrag(point: SwipePoint): boolean {
    if (hasOpenOverlay()) return false;
    if (anim && (anim.mode !== 'drag' || dragRef.current?.active)) return false;
    const parent = parentPathOf(displayLocation.pathname);
    if (!parent) return false;

    cancelFallback();
    pendingCommit.current = null;
    const width = stackRef.current?.offsetWidth || window.innerWidth;
    dragRef.current = {
      active: true,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastTime: point.timeStamp,
      velocity: 0,
      progress: 0,
      width,
      parentPath: parent,
      crossed: false,
    };
    setAnim({
      kind: 'pop',
      from: displayLocation,
      to: emptyLocation(parent),
      progress: 0,
      transition: false,
      mode: 'drag',
      durationMs: SETTLE_MS,
      easing: SETTLE_EASE,
    });
    armDragWatchdog();
    return true;
  }

  function abandonStuckDrag(): void {
    if (!anim || anim.mode !== 'drag') return;
    cancelDragFrame();
    pendingCommit.current = null;
    cancelFallback();
    setAnim(null);
  }

  function updateDrag(point: SwipePoint): void {
    const d = dragRef.current;
    if (!d?.active) return;

    const dx = point.x - d.startX;
    const elapsed = point.timeStamp - d.lastTime;
    if (elapsed > 0) d.velocity = (point.x - d.lastX) / elapsed;
    d.lastX = point.x;
    d.lastTime = point.timeStamp;

    const progress = Math.min(1, Math.max(0, dx) / d.width);
    d.progress = progress;
    if (!d.crossed && progress >= POP_THRESHOLD) {
      d.crossed = true;
      navigator.vibrate?.(10);
    }
    scheduleDragFrame();
  }

  function endDrag(): void {
    const d = dragRef.current;
    if (!d?.active) {
      abandonStuckDrag();
      return;
    }
    d.active = false;
    cancelDragFrame();

    // Итог решает не то, докуда экран КОГДА-ЛИБО доехал за время жеста, а куда он реально
    // летит в момент отпускания. Раньше здесь стоял залипающий d.crossed: стоило пальцу
    // один раз пересечь 40% ширины, и это запоминалось навсегда — последующий рывок обратно
    // уже ничего не менял, жест срабатывал по фиксированной точке экрана независимо от
    // скорости и направления (тот самый баг). Теперь решающая — мгновенная скорость на
    // pointerup, симметрично в обе стороны (буквально `v > 5.5` из bindSwipe референса,
    // но без Math.abs() и с обратным симметричным порогом для рывка назад): быстрый рывок
    // в любую сторону перевешивает то, где палец в этот момент оказался, и только когда
    // решающей скорости нет вовсе, решает финальная позиция — как в референсе.
    const flingForward = d.velocity > POP_VELOCITY;
    const flingBackward = -d.velocity > POP_VELOCITY;
    const commit = flingForward || (!flingBackward && d.progress > POP_THRESHOLD);

    if (commit) {
      pendingCommit.current = d.parentPath;
      // Инерция: чем резче был бросок, тем быстрее долетает остаток пути — не фиксированные
      // 340мс всегда, а время, пропорциональное скорости самого жеста.
      const remainingPx = d.width * (1 - d.progress);
      const pxPerSecond = Math.max(700, Math.abs(d.velocity) * 960);
      const durationMs = Math.min(400, Math.max(120, (remainingPx / pxPerSecond) * 1000));
      paintDrag(1, { durationMs, easing: POP_EASE });
      setAnim((a) => (a && a.mode === 'drag' ? { ...a, progress: 1, transition: true, durationMs, easing: POP_EASE } : a));
      armFallback(durationMs);
    } else {
      pendingCommit.current = null;
      // Та же инерция при возврате: решительный рывок назад летит обратно со скоростью
      // самого рывка, а не всегда одной и той же пружиной SETTLE_MS. Отпускание без
      // решающей скорости в обе стороны — прежняя пружинная анимация с лёгким перелётом.
      const remainingPx = d.width * d.progress;
      const pxPerSecond = Math.max(700, Math.abs(d.velocity) * 960);
      const durationMs = flingBackward ? Math.min(SETTLE_MS, Math.max(120, (remainingPx / pxPerSecond) * 1000)) : SETTLE_MS;
      const easing = flingBackward ? POP_EASE : SETTLE_EASE;
      paintDrag(0, { durationMs, easing });
      setAnim((a) => (a && a.mode === 'drag' ? { ...a, progress: 0, transition: true, durationMs, easing } : a));
      armFallback(durationMs);
    }
  }

  function cancelDrag(): void {
    const d = dragRef.current;
    if (!d?.active) {
      abandonStuckDrag();
      return;
    }
    d.active = false;
    cancelDragFrame();
    pendingCommit.current = null;
    paintDrag(0, { durationMs: SETTLE_MS, easing: SETTLE_EASE });
    setAnim((a) => (a && a.mode === 'drag' ? { ...a, progress: 0, transition: true, durationMs: SETTLE_MS, easing: SETTLE_EASE } : a));
    armFallback(SETTLE_MS);
  }

  const liveDrag = useRef({ begin: beginDrag, update: updateDrag, end: endDrag, cancel: cancelDrag });
  liveDrag.current = { begin: beginDrag, update: updateDrag, end: endDrag, cancel: cancelDrag };

  useEffect(() => {
    function handleMove(event: globalThis.PointerEvent): void {
      const swipe = backSwipeRef.current;
      if (!swipe || event.pointerId !== swipe.pointerId) return;

      if (swipe.taken) {
        liveDrag.current.update({ x: event.clientX, y: event.clientY, timeStamp: event.timeStamp });
        return;
      }

      const dx = event.clientX - swipe.startX;
      const dy = event.clientY - swipe.startY;
      if (dx > BACK_SWIPE_LOCK_PX && dx > BACK_SWIPE_DOMINANCE * Math.abs(dy)) {
        if (!liveDrag.current.begin({ x: swipe.startX, y: swipe.startY, timeStamp: swipe.startTime })) {
          backSwipeRef.current = null;
          return;
        }
        swipe.taken = true;
        liveDrag.current.update({ x: event.clientX, y: event.clientY, timeStamp: event.timeStamp });
        return;
      }
      if (Math.abs(dy) > BACK_SWIPE_LOCK_PX || dx < -BACK_SWIPE_LOCK_PX) backSwipeRef.current = null;
    }

    function handleUp(event: globalThis.PointerEvent): void {
      const swipe = backSwipeRef.current;
      if (!swipe || event.pointerId !== swipe.pointerId) return;
      backSwipeRef.current = null;
      if (swipe.taken) liveDrag.current.end();
    }

    function handleCancel(event: globalThis.PointerEvent): void {
      const swipe = backSwipeRef.current;
      if (!swipe || event.pointerId !== swipe.pointerId) return;
      backSwipeRef.current = null;
      if (swipe.taken) liveDrag.current.cancel();
    }

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, []);

  function handleStackPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (backSwipeRef.current?.taken) return;
    backSwipeRef.current = null;
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && (event.button !== 0 || event.clientX > MOUSE_EDGE_ZONE)) return;
    if ((event.target as HTMLElement | null)?.closest('[data-no-back-swipe], input[type="range"]')) return;
    if (hasOpenOverlay()) return;
    if (anim && (anim.mode !== 'drag' || dragRef.current?.active)) return;
    if (!parentPathOf(displayLocation.pathname)) return;

    backSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      taken: false,
    };
  }

  useEffect(() => {
    function finishResize(): void {
      const resize = resizeRef.current;
      if (!resize) return;
      resizeRef.current = null;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      useDesktopColumnsStore.getState().setListWidth(resize.width);
    }

    function handleMove(event: globalThis.PointerEvent): void {
      const resize = resizeRef.current;
      if (!resize || event.pointerId !== resize.pointerId) return;
      const width = clampDesktopListWidth(resize.startWidth + (event.clientX - resize.startX), resize.available);
      resize.width = width;
      applyDesktopListWidth(width);
    }

    function handleUp(event: globalThis.PointerEvent): void {
      if (resizeRef.current && event.pointerId !== resizeRef.current.pointerId) return;
      finishResize();
    }

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      finishResize();
    };
  }, []);

  function handleResizerPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (!event.isPrimary || event.button !== 0) return;
    const available = columnsRef.current?.getBoundingClientRect().width;
    const startWidth = listColumnRef.current?.getBoundingClientRect().width;
    if (!available || !startWidth) return;
    event.preventDefault();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      available,
      width: startWidth,
    };
    document.body.style.setProperty('cursor', 'col-resize');
    document.body.style.setProperty('user-select', 'none');
  }

  function handleResizerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
    const { listWidth, setListWidth } = useDesktopColumnsStore.getState();
    if (event.key === 'ArrowLeft') setListWidth(listWidth - step);
    else if (event.key === 'ArrowRight') setListWidth(listWidth + step);
    else if (event.key === 'Home') setListWidth(DESKTOP_LIST_WIDTH_DEFAULT);
    else return;
    event.preventDefault();
  }

  if (layout === 'desktop') {
    const currentTab = tabOf(location.pathname);
    // Контакты/Настройки/Профиль на десктопе не занимают левую колонку — список чатов там
    // остаётся всегда, а сама вкладка открывается карточкой поверх обеих колонок (решение
    // пользователя, ux-ui/14-desktop/04-main-menu.md, «Осталось решить», п. 1). Правая колонка
    // при этом не сбрасывается в пустое состояние — под лёгким затемнением остаётся тот же
    // чат, что был открыт до перехода в оверлей (lastPathForTab запоминает его на каждый чих
    // location в эффекте ниже).
    const overlayTab = currentTab === 'chats' ? null : currentTab;
    const chatsLocation = overlayTab ? emptyLocation(lastPathForTab('/chats')) : location;
    const leftLocation = CHATS_ROOT_LOCATION;
    const chatInfoId = matchPath('/chats/:chatId/info', chatsLocation.pathname)?.params.chatId ?? null;
    const chatLocation = chatInfoId ? emptyLocation(`/chats/${chatInfoId}`) : chatsLocation;
    const rightLocation = !isTabRoot(chatLocation.pathname) ? chatLocation : null;

    return (
      <div className={styles.stack} ref={stackRef}>
        <div className={styles.columns} ref={columnsRef}>
          <div className={styles.listColumn} ref={listColumnRef} data-desktop-column="list">
            <RouteSwitch location={leftLocation} />
          </div>
          <div className={styles.chatColumn} data-desktop-column="chat">
            {rightLocation ? <RouteSwitch location={rightLocation} /> : <EmptyChatColumn />}
          </div>
          <div
            className={styles.resizer}
            role="separator"
            aria-orientation="vertical"
            aria-label="Ширина списка чатов"
            tabIndex={0}
            onPointerDown={handleResizerPointerDown}
            onKeyDown={handleResizerKeyDown}
          />
        </div>
        {overlayTab && (
          <DesktopScreenModal
            title={OVERLAY_TAB_TITLE[overlayTab] ?? ''}
            onClose={() => navigate(lastPathForTab('/chats'))}
          >
            <RouteSwitch location={location} />
          </DesktopScreenModal>
        )}
        {!overlayTab && chatInfoId && (
          <DesktopScreenModal chromeless title="Профиль" onClose={() => navigate(`/chats/${chatInfoId}`)}>
            <ChatInfoCard chatId={chatInfoId} />
          </DesktopScreenModal>
        )}
      </div>
    );
  }

  const toLocation = anim?.to ?? displayLocation;

  const layers: ReactNode[] = [];
  if (anim) {
    layers.push(
      <div
        key={anim.from.pathname}
        ref={fromLayerRef}
        className={styles.layer}
        style={layerStyle(anim, 'from')}
      >
        <RouteSwitch location={anim.from} />
        <div ref={fromScrimRef} className={styles.scrim} style={scrimStyle(anim, 'from')} />
      </div>,
    );
  }
  layers.push(
    <div
      key={toLocation.pathname}
      ref={toLayerRef}
      className={`${styles.layer} ${tabAnim === 'forward' ? styles.tabForward : ''} ${tabAnim === 'back' ? styles.tabBack : ''}`}
      style={anim ? layerStyle(anim, 'to') : tabAnim ? TAB_ANIM_STYLE : undefined}
      onTransitionEnd={handleAnimEnd}
      onAnimationEnd={() => setTabAnim(null)}
    >
      <RouteSwitch location={toLocation} />
      {anim && <div ref={toScrimRef} className={styles.scrim} style={scrimStyle(anim, 'to')} />}
    </div>,
  );

  return (
    <div className={styles.stack} ref={stackRef} onPointerDown={handleStackPointerDown}>
      {layers}
    </div>
  );
}
