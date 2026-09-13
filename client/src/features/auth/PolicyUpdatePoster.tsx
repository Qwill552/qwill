import { Capacitor } from '@capacitor/core';
import type { PublicUser } from '@messenger/shared';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useLayoutMode } from '../../app/useLayoutMode';
import { Icon } from '../../ui/Icon';
import { Switch } from '../../ui/Switch';
import styles from './PolicyUpdatePoster.module.css';

const HINT_IDLE_MS = 3200;
const HINT_MIN_ROOM = 120;
const HINT_MAX_PROGRESS = 0.55;
const ACTIVITY_EVENTS = ['scroll', 'wheel', 'pointerdown', 'keydown', 'touchmove'] as const;

interface ChangedDocs {
  terms: boolean;
  privacy: boolean;
}

interface PolicyUpdatePosterProps {
  changedDocs: ChangedDocs;
  pending: boolean;
  error: string | null;
  dark: boolean;
  accepted: PublicUser | null;
  onAccept: () => void;
  onDecline: () => void;
  onEnter: () => void;
  onToggleTheme: () => void;
}

function ledeFor({ terms, privacy }: ChangedDocs): string {
  const tail = 'Чтобы продолжить пользоваться Qwill, ознакомьтесь с новой версией и примите её заново.';
  if (terms && privacy) {
    return `Пользовательское соглашение и Политика обработки персональных данных обновились. ${tail}`;
  }
  if (privacy) return `Политика обработки персональных данных обновилась. ${tail}`;
  return `Пользовательское соглашение обновилось. ${tail}`;
}

export function PolicyUpdatePoster({
  changedDocs,
  pending,
  error,
  dark,
  accepted,
  onAccept,
  onDecline,
  onEnter,
  onToggleTheme,
}: PolicyUpdatePosterProps) {
  const navigate = useNavigate();
  const layout = useLayoutMode();
  const frameRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const gateLabelId = useId();
  const [read, setRead] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const room = frame.scrollHeight - frame.clientHeight;
        setHint(room > HINT_MIN_ROOM && frame.scrollTop < room * HINT_MAX_PROGRESS);
      }, HINT_IDLE_MS);
    };
    const onActivity = () => {
      setHint(false);
      schedule();
    };

    ACTIVITY_EVENTS.forEach((name) => frame.addEventListener(name, onActivity, { passive: true }));
    schedule();

    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((name) => frame.removeEventListener(name, onActivity));
    };
  }, []);

  function openDoc(event: MouseEvent<HTMLAnchorElement>, path: string): void {
    if (!Capacitor.isNativePlatform()) return;
    event.preventDefault();
    navigate(path);
  }

  const acceptDisabled = pending || !read;

  return (
    <div className={styles.overlay}>
      <div className={styles.frameWrap}>
        <div className={styles.frame} ref={frameRef}>
          <div className={styles.poster}>
            <section className={styles.hero}>
              <div className={styles.cloud}>
                <div className={styles.cloudFloat}>
                  <div className={styles.cloudGoo}>
                    <div className={styles.goo1} />
                    <div className={styles.goo2} />
                    <div className={styles.goo3} />
                    <div className={styles.goo4} />
                    <div className={styles.goo5} />
                  </div>
                  <div className={styles.cloudPuff}>
                    <div className={styles.puff1} />
                    <div className={styles.puff2} />
                    <div className={styles.puff3} />
                    <div className={styles.puff4} />
                    <div className={styles.puff5} />
                  </div>
                  <div className={styles.cloudFace}>
                    <div className={`${styles.brow} ${styles.browLeft}`} />
                    <div className={`${styles.brow} ${styles.browRight}`} />
                    <div className={`${styles.eye} ${styles.eyeLeft}`}>
                      <div className={styles.glint} />
                    </div>
                    <div className={`${styles.eye} ${styles.eyeRight}`}>
                      <div className={styles.glint} />
                    </div>
                    <div className={styles.mouth} />
                    <div className={`${styles.cheek} ${styles.cheekLeft}`} />
                    <div className={`${styles.cheek} ${styles.cheekRight}`} />
                  </div>
                </div>
              </div>

              <div className={styles.lock}>
                <div className={styles.lockFloat}>
                  <div className={styles.shackle} />
                  <div className={styles.lockBody}>
                    <div className={styles.lockGloss} />
                    <div className={styles.keyholeEye} />
                    <div className={styles.keyholeStem} />
                  </div>
                </div>
              </div>

              <div className={styles.scroll}>
                <div className={styles.scrollFloat}>
                  <div className={styles.scrollRoll} />
                  <div className={styles.scrollPaper}>
                    <div className={styles.scrollTitle} />
                    <div className={styles.scrollLines}>
                      <div className={styles.line1} />
                      <div className={styles.line2} />
                      <div className={styles.line3} />
                      <div className={styles.line4} />
                    </div>
                  </div>
                  <div className={styles.scrollRoll} />
                </div>
              </div>

              <div className={`${styles.star} ${styles.star1}`} />
              <div className={`${styles.star} ${styles.star2}`} />
              <div className={`${styles.star} ${styles.star3}`} />
              <div className={`${styles.star} ${styles.star4}`} />
              <div className={`${styles.star} ${styles.star5}`} />
              <div className={`${styles.star} ${styles.star6}`} />
              <div className={`${styles.star} ${styles.star7}`} />
              <div className={`${styles.star} ${styles.star8}`} />

              <div className={styles.fog}>
                <div className={styles.smoke1} />
                <div className={styles.smoke2} />
                <div className={styles.smoke3} />
                <div className={styles.smoke4} />
                <div className={styles.smoke5} />
              </div>

              <div className={styles.content}>
                <div className={styles.header}>
                  <div className={styles.brandCol}>
                    <div className={styles.wordmark}>Qwill</div>
                    <button
                      type="button"
                      className={`${styles.themeToggle} ${dark ? styles.themeToggleDark : ''}`}
                      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
                      onClick={onToggleTheme}
                    >
                      <span className={styles.themeToggleKnob}>
                        <Icon name={dark ? 'sun' : 'moon'} className={styles.themeToggleIcon} />
                      </span>
                    </button>
                  </div>
                  <div className={styles.badge}>
                    <Icon name="shield" className={styles.badgeIcon} />
                    Важное обновление
                  </div>
                </div>

                <h1 className={styles.title} ref={titleRef} tabIndex={-1}>
                  Соглашение обновилось
                </h1>

                <p className={styles.subtitle}>
                  Новая версия вступает в&nbsp;силу для всех, кто пользуется Qwill.
                </p>
              </div>
            </section>

            <section className={styles.card}>
              {accepted ? (
                <div className={styles.done}>
                  <div className={styles.doneBadge}>
                    <Icon name="check" className={styles.doneIcon} />
                  </div>
                  <div className={styles.doneText}>
                    <h2 className={styles.doneTitle}>Спасибо, принято</h2>
                    <p className={styles.doneLede}>
                      Новая версия соглашения и политики сохранена в вашем профиле. Можно возвращаться
                      к чатам.
                    </p>
                    <button type="button" className={styles.doneButton} onClick={onEnter}>
                      Перейти в Qwill
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className={styles.lede}>{ledeFor(changedDocs)}</p>

                  <div className={styles.docs}>
                    {changedDocs.terms && (
                      <a
                        className={styles.doc}
                        href="/legal/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => openDoc(event, '/legal/terms')}
                      >
                        <Icon name="file" className={styles.docIcon} />
                        Пользовательское соглашение
                      </a>
                    )}
                    {changedDocs.privacy && (
                      <a
                        className={styles.doc}
                        href="/legal/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => openDoc(event, '/legal/privacy')}
                      >
                        <Icon name="lock" className={styles.docIcon} />
                        Политика обработки персональных данных
                      </a>
                    )}
                  </div>

                  <div className={styles.gate}>
                    <span className={styles.gateLabel} id={gateLabelId}>
                      Я прочитал(а) новую&nbsp;версию
                    </span>
                    <Switch checked={read} onChange={setRead} labelledBy={gateLabelId} />
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.decline}
                      onClick={onDecline}
                      disabled={pending}
                    >
                      {layout === 'mobile' ? 'Отказываюсь' : 'Не принимаю'}
                    </button>
                    <div className={styles.acceptSlot}>
                      {error && (
                        <p className={styles.errorBubble} role="alert">
                          {error}
                        </p>
                      )}
                      <button
                        type="button"
                        className={styles.accept}
                        onClick={onAccept}
                        disabled={acceptDisabled}
                      >
                        Принимаю
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        <div className={`${styles.hint} ${hint ? styles.hintVisible : ''}`} aria-hidden="true">
          <div className={styles.hintInner}>
            <span className={styles.hintPill}>Листайте вниз</span>
            <span className={styles.hintCircle}>
              <Icon name="chevron-down" size={34} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
