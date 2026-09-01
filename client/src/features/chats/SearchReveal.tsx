import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { AmbientBlobs } from '../../app/AmbientBlobs';
import { useEscapeKey } from '../../app/hotkeys';
import { useBackHandler } from '../../app/useBackHandler';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import { RecentSearches } from '../search/RecentSearches';
import { SearchResults } from '../search/SearchResults';
import styles from './SearchReveal.module.css';

export interface RevealOrigin {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
}

interface SearchRevealProps {
  /** Геометрия нажатого элемента (строки поиска или кнопки-лупы) относительно .screen —
   *  отсюда стартует строка поиска на первом этапе. */
  origin: RevealOrigin;
  /** Геометрия места стыковки (шапка, .headerRow) относительно .screen — сюда строка едет. */
  dock: RevealOrigin;
  /** Открыли из маленькой кнопки-лупы, а не из полной строки — стыковка чуть длиннее,
   *  подпись проявляется отдельным отложенным фейдом, а не сразу. */
  fromIcon: boolean;
  /** Подпись в поле — та же, что и на кнопке-триггере, с которой панель раскрылась: на
   *  десктопе она короче (ChatsScreen.tsx, SEARCH_PLACEHOLDER_DESKTOP). */
  placeholder: string;
  /** Момент начала полёта капсулы обратно — по этому сигналу ChatsScreen.tsx мгновенно
   *  открывает настоящую строку/лупу под капсулой-подделкой (см. комментарий у phase==='retreat'
   *  ниже: без этого настоящая строка проявлялась только после исчезновения капсулы отдельным,
   *  визуально несвязанным фейдом — выглядело как рывок). */
  onRetreatStart: () => void;
  onClose: () => void;
  onOpenChat: (chatId: string) => void;
}

type Phase = 'dock' | 'wave-open' | 'open' | 'wave-close' | 'retreat';

// Строка поиска летит с лёгким перелётом — не строго на место, а чуть дальше и обратно
// (пружина), отсюда --ease-spring, а не обычная плавная кривая: эффект «плавающего» интерфейса.
const DOCK_MS_PILL = 380;
const DOCK_MS_ICON = 440;
const DOCK_EASE = 'var(--ease-spring)';
const RETREAT_MS_PILL = 300;
const RETREAT_MS_ICON = 340;
const RETREAT_EASE = 'var(--ease-spring)';

// Волна — без пружины, просто более неспешная, чем раньше.
const WAVE_OPEN_MS = 400;
const WAVE_CLOSE_MS = 340;
/** Высота тающей нижней кромки маски — «наплыв», а не жёсткий разрез. Дублируется в
 *  SearchReveal.module.css (.wave, mask-image): сама маска статична, JS двигает только
 *  её позицию, но закрытое положение считается отсюда (см. waveStyle ниже). */
const FEATHER_PX = 28;

/** Отложенное проявление подписи, когда строка вырастает из маленькой лупы — иначе текст
 *  на мгновение виден сплющенным внутри узкой окружности. */
const LABEL_DELAY_MS = 100;
const LABEL_FADE_MS = 160;

/** Открытие поиска — двухэтапная хореография:
 *  1. строка поиска едет геометрией (top/left/width/height/border-radius — тот же приём,
 *     которым капсула раньше раздвигалась во весь экран) от места нажатия (`origin`) к месту
 *     шапки (`dock`); шапка на это время прячется — ChatsScreen.tsx, .headerRowHidden;
 *  2. от нижнего края пристыкованной строки вниз идёт волна — панель раскрывается движущейся
 *     маской с мягким, тающим краем (не жёсткой шторкой: пользователь настоял на дисолве).
 *  Закрытие — то же самое в обратном порядке: сперва уезжает волна, потом капсула возвращается
 *  в origin. За пределами референса — там поле поиска ничего не открывает. */
export function SearchReveal({
  origin,
  dock,
  fromIcon,
  placeholder,
  onRetreatStart,
  onClose,
  onOpenChat,
}: SearchRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const waveBodyRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('dock');
  const [barBox, setBarBox] = useState<RevealOrigin>(origin);
  const [waveOpen, setWaveOpen] = useState(false);
  const [waveHeight, setWaveHeight] = useState<number | null>(null);
  // Высота .root (== .screen): по ней слой капель внутри панели растягивается на весь экран,
  // чтобы капли встали там же, где настоящие капли фона (см. waveBlobsStyle ниже).
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  // ChatsScreen.tsx передаёт эти колбэки инлайн-стрелками — новая ссылка на каждый его рендер.
  // Через ref, а не в зависимостях эффекта: посторонний ререндер ChatsScreen (например, от
  // presence) не должен перезапускать таймер возврата и звать onRetreatStart повторно.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onRetreatStartRef = useRef(onRetreatStart);
  onRetreatStartRef.current = onRetreatStart;

  const dockMs = fromIcon ? DOCK_MS_ICON : DOCK_MS_PILL;
  const retreatMs = fromIcon ? RETREAT_MS_ICON : RETREAT_MS_PILL;

  const startClose = useCallback(() => {
    inputRef.current?.blur();
    setPhase((p) => (p === 'wave-close' || p === 'retreat' ? p : 'wave-close'));
  }, []);

  useBackHandler(phase !== 'wave-close' && phase !== 'retreat', startClose);
  useEscapeKey(phase !== 'wave-close' && phase !== 'retreat', startClose);

  useLayoutEffect(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setContainerHeight(rect.height);
  }, []);

  // Разворачиваем на следующий кадр — сперва отрисовать в точных границах origin, иначе
  // браузер схлопнёт переход геометрии в скачок.
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => setBarBox(dock));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Волна стартует на середине полёта капсулы к месту стыковки, а не после его завершения —
  // капсула долетает уже поверх раскрывающейся волны, а не отдельным, разделённым по времени
  // шагом. Сама капсула при этом продолжает лететь как летела: её транзишен не перезапускается,
  // потому что barBox/barMs/barEase не меняются при этом переключении фазы.
  useEffect(() => {
    if (phase !== 'dock') return;
    const timer = window.setTimeout(() => setPhase('wave-open'), dockMs / 2);
    return () => window.clearTimeout(timer);
  }, [phase, dockMs]);

  // Волна: сперва измеряем реальную высоту панели (нужна маске как масштаб), на следующий
  // кадр включаем открытую маску — иначе браузер опять схлопнёт переход в скачок.
  useLayoutEffect(() => {
    if (phase !== 'wave-open') return;
    setWaveHeight(waveRef.current?.getBoundingClientRect().height ?? window.innerHeight);
    const raf = requestAnimationFrame(() => setWaveOpen(true));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'wave-open') return;
    const timer = window.setTimeout(() => setPhase('open'), WAVE_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'open') return;
    inputRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'wave-close') return;
    setWaveOpen(false);
    const timer = window.setTimeout(() => setPhase('retreat'), WAVE_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'retreat') return;
    // Настоящая строка/лупа под капсулой-подделкой открывается СРАЗУ, а не после того, как
    // капсула долетит и исчезнет: капсула всё равно первую часть пути закрывает её собой,
    // а «садится» уже поверх уже видимой настоящей строки — без отдельного, рассинхронного
    // проявления, которое выглядело как рывок/вторая капсула.
    onRetreatStartRef.current();
    setBarBox(origin);
    const timer = window.setTimeout(() => onCloseRef.current(), retreatMs);
    return () => window.clearTimeout(timer);
  }, [phase, origin, retreatMs]);

  const barMs = phase === 'retreat' ? retreatMs : dockMs;
  const barEase = phase === 'retreat' ? RETREAT_EASE : DOCK_EASE;

  // У полной строки поиска и у места стыковки совпадает всё, кроме вертикали (оба ряда —
  // соседи в одном контейнере с одинаковыми полями, высота и радиус заданы одной константой
  // в ChatsScreen.tsx). Значит, в этом сценарии капсуле незачем менять габариты: она стоит
  // сразу в размерах стыковки и едет чистым transform — размывающий слой сохраняет свою
  // геометрию, и блюру нечего пересчитывать на ходу (см. комментарий в .module.css про шлейф).
  const pillLike =
    origin.width === dock.width && origin.height === dock.height && origin.radius === dock.radius;

  const barStyle: CSSProperties = pillLike
    ? {
        top: dock.top,
        left: dock.left,
        width: dock.width,
        height: dock.height,
        borderRadius: dock.radius,
        transform: `translateY(${barBox.top - dock.top}px)`,
        transitionDuration: `${barMs}ms`,
        transitionTimingFunction: barEase,
      }
    : {
        top: barBox.top,
        left: barBox.left,
        width: barBox.width,
        height: barBox.height,
        borderRadius: barBox.radius,
        transitionDuration: `${barMs}ms`,
        transitionTimingFunction: barEase,
      };

  const showWave = phase === 'wave-open' || phase === 'open' || phase === 'wave-close';
  const height = waveHeight ?? window.innerHeight;
  /** Нижняя кромка капсулы. Панель раскрывается ОТСЮДА, но начинается не отсюда: сама она
   *  лежит на весь экран, включая полосу за капсулой (см. ниже). */
  const waveTop = dock.top + dock.height;
  // Панель занимает весь экран, а не прямоугольник от нижней кромки капсулы вниз. Раньше
  // за капсулой и над ней оставался прежний экран: капсула размывала стеклом его, панель
  // рисовала себя, и на их стыке — ровно по кромке капсулы — читалась чёткая линия «здесь
  // кончился старый интерфейс». Теперь под капсулой лежит та же панель, что и под всем
  // остальным, и стыка нет вовсе: делить нечего.
  const waveBlobsStyle: CSSProperties = {
    top: 0,
    height: containerHeight ?? window.innerHeight,
  };
  // Маска — непрозрачная полоса [offset, offset + maskHeight − FEATHER_PX], тающая к
  // offset + maskHeight. Закрытое состояние: её нижняя кромка стоит ровно под капсулой, то
  // есть панель уже нарисована за капсулой, но ещё никуда не «наплыла». Открытое: кромка ушла
  // за нижний край экрана.
  //
  // Маска на FEATHER_PX выше самой панели нарочно: будь она вровень, в открытом положении
  // тающая кромка съедала бы последние 28px панели — та навсегда оставалась бы там
  // полупрозрачной. На телефоне под этой полосой ничего не было и никто не замечал, а на
  // десктопе в неё попало свечение кнопки «+» и торчало сквозь фон поиска. Теперь при
  // открытой панели кромка растворяется уже за её нижним краем.
  const maskHeight = height + FEATHER_PX;
  const offset = waveOpen ? 0 : waveTop - height;
  const waveStyle: CSSProperties = {
    top: 0,
    maskSize: `100% ${maskHeight}px`,
    WebkitMaskSize: `100% ${maskHeight}px`,
    maskPosition: `0 ${offset}px`,
    WebkitMaskPosition: `0 ${offset}px`,
    transitionDuration: `${phase === 'wave-close' ? WAVE_CLOSE_MS : WAVE_OPEN_MS}ms`,
    transitionTimingFunction: phase === 'wave-close' ? 'var(--ease-close)' : 'var(--ease-screen)',
  };
  // Содержимое панели остаётся под капсулой — полосу за ней панель закрывает собой, но
  // не занимает текстом. Зазор до выдачи задаёт контейнер: на десктопе полоса поиска
  // сплошная, и выдача начинается сразу под ней (SearchReveal.module.css).
  const waveBodyStyle: CSSProperties = {
    paddingTop: `calc(${waveTop}px + var(--search-body-gap, var(--space-6)))`,
  };

  // При возврате в лупу подпись тоже должна уйти — иначе текст на мгновение виден
  // сплющенным внутри сжимающейся до кружка капсулы (та же причина, что и при появлении).
  const labelHiddenForIcon = fromIcon && (phase === 'dock' || phase === 'retreat');
  const labelStyle: CSSProperties | undefined = fromIcon
    ? {
        transitionDelay: phase === 'retreat' ? '0ms' : `${LABEL_DELAY_MS}ms`,
        transitionDuration: `${LABEL_FADE_MS}ms`,
        opacity: labelHiddenForIcon ? 0 : 1,
      }
    : undefined;

  return (
    <div ref={rootRef} className={styles.root} role="search">
      <div className={styles.dockBar} style={barStyle}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.dockIcon}>
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          className={styles.dockInput}
          style={labelStyle}
          type="text"
          value={query}
          placeholder={placeholder}
          aria-label="Поиск чатов и людей"
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className={styles.close} aria-label="Закрыть" onClick={startClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {showWave && (
        <div ref={waveRef} className={styles.wave} style={waveStyle}>
          <div className={styles.waveBlobs} style={waveBlobsStyle}>
            <AmbientBlobs />
          </div>
          <div ref={waveBodyRef} className={`${styles.waveBody} hide-native-scrollbar`} style={waveBodyStyle}>
            <ScrollIndicator target={waveBodyRef} />
            {query.trim().length > 0 ? (
              <SearchResults query={query} onOpenChat={onOpenChat} />
            ) : (
              <RecentSearches onOpenChat={onOpenChat} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
