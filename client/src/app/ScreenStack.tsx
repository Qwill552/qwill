import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type TransitionEvent } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom';

import { AppearanceScreen } from '../pages/AppearanceScreen';
import { ChatInfoScreen } from '../pages/ChatInfoScreen';
import { ChatScreen } from '../pages/ChatScreen';
import { ChatsScreen } from '../pages/ChatsScreen';
import { ContactsScreen } from '../pages/ContactsScreen';
import { ProfileScreen } from '../pages/ProfileScreen';
import { SettingsScreen } from '../pages/SettingsScreen';
import { StubScreen } from '../pages/StubScreen';
import { hasOpenOverlay } from './useBackHandler';
import { registerEdgeSwipeHandlers, type EdgeSwipePoint } from './edgeSwipeBridge';
import { isChatFeedPath, parentPathOf, transitionKind, type TransitionKind } from './routing';
import { rememberTabPath } from './tabNav';
import styles from './ScreenStack.module.css';

/** Зона у левого края, откуда стартует свайп «назад» — буквально из bindSwipe в референсе. */
const EDGE_ZONE = 32;
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

/** Экраны стека — обе анимируемые прослойки (уходящая/приходящая) рисуют один и тот же
 *  набор маршрутов с разным `location`, отсюда и живой предпросмотр экрана под пальцем
 *  при свайпе «назад»: он использует настоящий компонент, а не фейковую картинку. */
function RouteSwitch({ location }: { location: Location }) {
  return (
    <Routes location={location}>
      <Route path="/chats" element={<ChatsScreen />} />
      <Route path="/chats/:chatId" element={<ChatScreen />} />
      <Route path="/chats/:chatId/info" element={<ChatInfoScreen />} />
      <Route path="/contacts" element={<ContactsScreen />} />
      <Route path="/contacts/:userId" element={<StubScreen title="Контакт" backTo="/contacts" />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/settings/appearance" element={<AppearanceScreen />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="*" element={<Navigate to="/chats" replace />} />
    </Routes>
  );
}

interface AnimState {
  kind: 'push' | 'pop';
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
function openness(anim: AnimState): number {
  return anim.kind === 'push' ? anim.progress : 1 - anim.progress;
}

/** true — этот физический слой (from/to) сейчас играет роль вложенного экрана (буквально
 *  {{hasChat}}: translateX 100%→0, поверх всего); false — роль корня-таб-контента под ним
 *  (rootShift: сдвиг −22%, сжатие до .955, притемнение до .55 brightness). */
function isOverlayLayer(anim: AnimState, layer: 'from' | 'to'): boolean {
  return (anim.kind === 'push' && layer === 'to') || (anim.kind === 'pop' && layer === 'from');
}

function layerStyle(anim: AnimState, layer: 'from' | 'to'): CSSProperties {
  const o = openness(anim);
  const transition = anim.transition ? `transform ${anim.durationMs}ms ${anim.easing}` : 'none';
  if (isOverlayLayer(anim, layer)) {
    return {
      zIndex: 2,
      transform: `translateX(${(100 * (1 - o)).toFixed(2)}%)`,
      transition,
    };
  }
  return {
    zIndex: 1,
    transform: `translateX(${(-22 * o).toFixed(2)}%) scale(${(1 - 0.045 * o).toFixed(4)})`,
    transition,
  };
}

/** Притемнение корня под открытым вложенным экраном — буквально та же доля (.45), что и
 *  прежний `filter:brightness()` на самом слое, но отдельным непрозрачным слоем поверх него,
 *  а не фильтром на предке. `filter` на предке заставляет браузер на каждый кадр анимации
 *  расплющивать (rasterize) все дочерние compositing-слои — а с этапа 2 их под рукой у чата
 *  десятки (блюр у каждого пузыря, шапки, композера), из-за чего и свайп «назад», и переход
 *  в профиль собеседника заметно тормозили, а стекло на следующем экране «доезжало» с
 *  задержкой (ChatsScreen после свайпа назад, ChatInfoScreen после перехода из чата). */
function scrimStyle(anim: AnimState, layer: 'from' | 'to'): CSSProperties {
  if (isOverlayLayer(anim, layer)) return { opacity: 0 };
  const o = openness(anim);
  const transition = anim.transition ? `opacity ${anim.durationMs}ms ${anim.easing}` : 'none';
  return { opacity: (0.45 * o).toFixed(3), transition };
}

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
  const stackRef = useRef<HTMLDivElement>(null);

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
    vertical: boolean;
  } | null>(null);
  const pendingCommit = useRef<string | null>(null);
  /** Дозор на случай, если `transitionend` не придёт вовсе (см. armFallback ниже). */
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackToken = useRef(0);

  useEffect(() => {
    rememberTabPath(location.pathname);
  }, [location.pathname]);

  useEffect(() => () => clearFallback(), []);

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
  }, [location]);

  function handleAnimEnd(event: TransitionEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) return;
    if (!anim) return;
    finishAnim();
  }

  // beginDrag/updateDrag/endDrag/cancelDrag берут только координаты и метку времени, а не
  // React PointerEvent — их зовут и родные обработчики .edge (свайп на любом другом экране),
  // и MessageRow через edgeSwipeBridge (свайп в ленте чата, где решение «это точно свайп
  // назад, а не long-press по сообщению» принимает сама строка, см. её комментарий у
  // handlePointerMove). beginDrag получает координаты НАСТОЯЩЕГО pointerdown, а не момента
  // передачи — иначе экран «доезжал» бы до пальца вместо того, чтобы уже стоять там, где надо.
  function beginDrag(point: EdgeSwipePoint): void {
    if (anim || hasOpenOverlay()) return;
    const parent = parentPathOf(displayLocation.pathname);
    if (!parent) return;

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
      vertical: false,
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
  }

  function updateDrag(point: EdgeSwipePoint): void {
    const d = dragRef.current;
    if (!d?.active) return;

    const dx = point.x - d.startX;
    const dy = point.y - d.startY;
    if (!d.vertical && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      // Ушли по вертикали раньше горизонтали — это скролл, жест отменяется (gestures.md, правило 2).
      d.active = false;
      setAnim(null);
      return;
    }

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
    setAnim((a) => (a && a.mode === 'drag' ? { ...a, progress, transition: false } : a));
  }

  function endDrag(): void {
    const d = dragRef.current;
    if (!d?.active) return;
    d.active = false;

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
      setAnim((a) => (a && a.mode === 'drag' ? { ...a, progress: 0, transition: true, durationMs, easing } : a));
      armFallback(durationMs);
    }
  }

  /** Жест сорвался без внятного отпускания (например, MessageRow потеряла указатель) —
   *  просто гасим драг без commit/settle-анимации, экран остаётся на месте. */
  function cancelDrag(): void {
    if (dragRef.current) dragRef.current.active = false;
    setAnim(null);
  }

  // Родные обработчики .edge — только на экранах, где эта полоса физически владеет
  // касанием целиком (везде, кроме ленты чата, см. рендер ниже и isChatFeedPath).
  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.clientX > EDGE_ZONE) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Указатель не «активен» с точки зрения браузера — жест всё равно продолжит
      // работать по обычным pointermove/pointerup, просто без захвата вне зоны.
    }
    beginDrag({ x: event.clientX, y: event.clientY, timeStamp: event.timeStamp });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    updateDrag({ x: event.clientX, y: event.clientY, timeStamp: event.timeStamp });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.active) event.currentTarget.releasePointerCapture(event.pointerId);
    endDrag();
  }

  // Единственная точка, через которую MessageRow передаёт уже начатый жест (ux-ui.md,
  // журнал, этап 6). Регистрируется один раз при монтировании — сам ScreenStack не
  // размонтируется, а beginDrag/updateDrag/endDrag/cancelDrag меняются каждый рендер
  // (замыкают текущие anim/displayLocation), поэтому передаём в реестр не их самих, а
  // тонкие обёртки поверх ref'а с последними версиями — тот же приём, что onCloseRef
  // в useBackHandler.ts, чтобы регистрация не гонялась за каждым рендером.
  const liveDragHandlers = useRef({ begin: beginDrag, update: updateDrag, end: endDrag, cancel: cancelDrag });
  liveDragHandlers.current = { begin: beginDrag, update: updateDrag, end: endDrag, cancel: cancelDrag };

  useEffect(
    () =>
      registerEdgeSwipeHandlers({
        begin: (point) => liveDragHandlers.current.begin(point),
        update: (point) => liveDragHandlers.current.update(point),
        end: () => liveDragHandlers.current.end(),
        cancel: () => liveDragHandlers.current.cancel(),
      }),
    [],
  );

  const toLocation = anim?.to ?? displayLocation;

  return (
    <div className={styles.stack} ref={stackRef}>
      {anim && (
        <div key={anim.from.pathname} className={styles.layer} style={layerStyle(anim, 'from')}>
          <RouteSwitch location={anim.from} />
          <div className={styles.scrim} style={scrimStyle(anim, 'from')} />
        </div>
      )}

      <div
        key={toLocation.pathname}
        className={`${styles.layer} ${tabAnim === 'forward' ? styles.tabForward : ''} ${tabAnim === 'back' ? styles.tabBack : ''}`}
        style={anim ? layerStyle(anim, 'to') : undefined}
        onTransitionEnd={handleAnimEnd}
        onAnimationEnd={() => setTabAnim(null)}
      >
        <RouteSwitch location={toLocation} />
        {anim && <div className={styles.scrim} style={scrimStyle(anim, 'to')} />}
      </div>

      <div
        key="edge"
        className={styles.edge}
        // Лента чата разбирает этот же жест сама (MessageRow, через edgeSwipeBridge) —
        // здесь полоса не должна физически перехватывать касание, иначе long-press по
        // сообщению у самого края никогда бы не получал pointerdown вовсе (ux-ui.md,
        // журнал, этап 6). На остальных экранах конфликтовать не с чем — полоса как была.
        style={isChatFeedPath(toLocation.pathname) ? { pointerEvents: 'none' } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
