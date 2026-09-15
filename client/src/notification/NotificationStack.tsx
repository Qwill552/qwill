import type { AvatarColor } from '@messenger/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  openNotificationPopup,
  resizeNotificationPopup,
  subscribeToNotificationCloseChat,
  subscribeToNotificationShow,
  subscribeToNotificationTheme,
  type DesktopNotificationItem,
} from '../native/notificationBridge';
import { avatarGradientFor, avatarGradientForColor } from '../ui/tint';
import styles from './NotificationStack.module.css';

const VISIBLE_LIMIT = 3;
const LIFETIME_MS = 6000;
const TICK_MS = 250;
/** Длительность медленного затухания по бездействию — как `notifySlowHide` у Telegram
 *  Desktop. Должна совпадать с `--dur-notify-hide`, иначе карточка исчезнет раньше, чем
 *  доиграет прозрачность. */
const FADE_MS = 4000;

interface LiveItem extends DesktopNotificationItem {
  remainingMs: number;
  fading: boolean;
}

function gradientOf(item: DesktopNotificationItem): string {
  return item.avatarColor ? avatarGradientForColor(item.avatarColor as AvatarColor) : avatarGradientFor(item.chatId);
}

export function NotificationStack() {
  const [items, setItems] = useState<LiveItem[]>([]);
  const hoveredRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stopShow = subscribeToNotificationShow((item) => {
      setItems((current) => [...current, { ...item, remainingMs: LIFETIME_MS, fading: false }]);
    });

    const stopClose = subscribeToNotificationCloseChat((chatId) => {
      setItems((current) => current.filter((item) => item.chatId !== chatId));
    });

    const stopTheme = subscribeToNotificationTheme((theme) => {
      document.documentElement.dataset.theme = theme;
    });

    return () => {
      stopShow();
      stopClose();
      stopTheme();
    };
  }, []);

  // Уход по бездействию — медленное затухание: карточка сначала помечается `fading`
  // (CSS ведёт одну прозрачность, композитор справляется без пересчёта раскладки), и лишь
  // когда затухание доиграло, строка выбрасывается. Наведение курсора возвращает её.
  useEffect(() => {
    const timer = setInterval(() => {
      if (hoveredRef.current) {
        setItems((current) =>
          current.some((item) => item.fading)
            ? current.map((item) => (item.fading ? { ...item, remainingMs: LIFETIME_MS, fading: false } : item))
            : current,
        );
        return;
      }

      setItems((current) =>
        current
          .map((item) => ({ ...item, remainingMs: item.remainingMs - TICK_MS }))
          .map((item) => (item.remainingMs <= 0 && !item.fading ? { ...item, fading: true, remainingMs: FADE_MS } : item))
          .filter((item) => !(item.fading && item.remainingMs <= 0)),
      );
    }, TICK_MS);

    return () => clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const report = (): void => resizeNotificationPopup(items.length === 0 ? 0 : Math.ceil(root.scrollHeight));
    report();

    const observer = new ResizeObserver(report);
    observer.observe(root);
    return () => observer.disconnect();
  }, [items.length]);

  const visible = items.slice(-VISIBLE_LIMIT);
  const hiddenCount = items.length - visible.length;

  return (
    <div
      ref={rootRef}
      className={styles.stack}
      onMouseEnter={() => {
        hoveredRef.current = true;
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
      }}
    >
      {hiddenCount > 0 && <div className={styles.more}>и ещё {hiddenCount}</div>}

      {visible.map((item) => (
        <div
          key={item.id}
          className={`${styles.card} ${item.fading ? styles.fading : ''}`}
          role="button"
          tabIndex={-1}
          onClick={() => {
            openNotificationPopup(item.chatId);
            setItems((current) => current.filter((candidate) => candidate.chatId !== item.chatId));
          }}
        >
          <span className={styles.avatar} style={{ ['--avatar-gradient' as string]: gradientOf(item) }}>
            {item.title.charAt(0).toUpperCase()}
            {item.avatarUrl && <img className={styles.avatarImage} src={item.avatarUrl} alt="" />}
          </span>

          <span className={styles.body}>
            <span className={styles.head}>
              <span className={styles.title}>{item.title}</span>
              <span className={styles.time}>{item.time}</span>
            </span>
            <span className={styles.preview}>{item.body}</span>
          </span>

          <button
            type="button"
            className={styles.close}
            aria-label="Закрыть уведомление"
            onClick={(event) => {
              event.stopPropagation();
              setItems((current) => current.filter((candidate) => candidate.id !== item.id));
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
