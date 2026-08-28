import { useCallback, useEffect, useRef, useState } from 'react';

import { createReportRequest } from '../../api/admin';
import { ApiError } from '../../api/client';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import styles from './ProfileCardFrame.module.css';

/** Сколько кадр может пробыть вне экрана, прежде чем его снимут: процессор освобождается,
 *  а заодно гаснет фоновая работа при уходе на другую вкладку. */
const OFFSCREEN_GRACE_MS = 5000;
/** Не отчитался — значит подвис ещё до первого кадра. Кнопка «Остановить» подсвечивается сама,
 *  чтобы зритель не гадал, приложение это тормозит или чужая визитка. */
const READY_TIMEOUT_MS = 3000;

interface ProfileCardFrameProps {
  cardUrl: string;
  authorId: string;
  authorName: string;
  /** Свой профиль и предпросмотр редактора запускаются сразу — автор смотрит своё. */
  autoStart?: boolean;
}

export function ProfileCardFrame({ cardUrl, authorId, authorName, autoStart = false }: ProfileCardFrameProps) {
  const [running, setRunning] = useState(autoStart);
  const [ready, setReady] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const [readyLate, setReadyLate] = useState(false);
  const [reporting, setReporting] = useState(false);

  const windowRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadCount = useRef(0);
  const channel = useRef<MessageChannel | null>(null);

  const detach = useCallback(() => {
    channel.current?.port1.close();
    channel.current = null;
    loadCount.current = 0;
    setReady(false);
  }, []);

  const stop = useCallback(() => {
    detach();
    setRunning(false);
  }, [detach]);

  useEffect(() => {
    detach();
    setRunning(autoStart);
    setEscaped(false);
  }, [cardUrl, autoStart, detach]);

  useEffect(() => {
    if (!running) {
      setReadyLate(false);
      return;
    }
    if (ready) return;
    const timer = window.setTimeout(() => setReadyLate(true), READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [running, ready]);

  useEffect(() => {
    const node = windowRef.current;
    if (!running || !node) return;

    let offscreenTimer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(offscreenTimer);
        if (entry?.isIntersecting) return;
        offscreenTimer = window.setTimeout(stop, OFFSCREEN_GRACE_MS);
      },
      { threshold: 0 },
    );
    observer.observe(node);
    return () => {
      window.clearTimeout(offscreenTimer);
      observer.disconnect();
    };
  }, [running, stop]);

  function handleLoad(): void {
    loadCount.current += 1;
    // Первая загрузка штатная. Вторая означает, что кадр ушёл куда-то сам — снимаем его.
    if (loadCount.current > 1) {
      setEscaped(true);
      stop();
      return;
    }

    const ch = new MessageChannel();
    channel.current = ch;
    ch.port1.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'ready') setReady(true);
    };
    // targetOrigin обязан быть '*': у песочницы непрозрачный origin, указать нечего.
    // Это безопасно ровно потому, что через порт не передаётся ничего секретного.
    iframeRef.current?.contentWindow?.postMessage({ type: 'card-init' }, '*', [ch.port2]);
  }

  async function sendReport(comment: string): Promise<void> {
    await createReportRequest({ targetUserId: authorId, kind: 'card', comment });
  }

  return (
    <div className={styles.root}>
      <div ref={windowRef} className={styles.window}>
        {running ? (
          <iframe
            ref={iframeRef}
            className={styles.frame}
            src={cardUrl}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            allow=""
            title={`Оформление профиля: ${authorName}`}
            onLoad={handleLoad}
          />
        ) : (
          <div className={styles.placeholder}>
            <Icon name="palette" size={26} />
            <p className={styles.placeholderText}>
              {escaped ? 'Оформление отключено' : `Оформление профиля: ${authorName}`}
            </p>
            {!escaped && (
              <button type="button" className={styles.start} onClick={() => setRunning(true)}>
                Показать оформление
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={`${styles.control} ${running && readyLate && !ready ? styles.controlAlert : ''}`}
          onClick={stop}
          disabled={!running}
        >
          Остановить
        </button>
        <button type="button" className={styles.control} onClick={() => setReporting(true)}>
          Пожаловаться
        </button>
      </div>

      {reporting && <ReportSheet authorName={authorName} onClose={() => setReporting(false)} onSend={sendReport} />}
    </div>
  );
}

interface ReportSheetProps {
  authorName: string;
  onClose: () => void;
  onSend: (comment: string) => Promise<void>;
}

function ReportSheet({ authorName, onClose, onSend }: ReportSheetProps) {
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend(): Promise<void> {
    setSending(true);
    setError(null);
    try {
      await onSend(comment.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить жалобу');
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet title="Пожаловаться" onClose={onClose}>
      {sent ? (
        <p className={styles.reportDone}>Жалоба отправлена. Её посмотрит человек.</p>
      ) : (
        <div className={styles.report}>
          <p className={styles.reportHint}>Что не так с оформлением профиля «{authorName}»?</p>
          <textarea
            className={styles.reportInput}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={4}
            autoFocus
          />
          {error && <p className={styles.reportError}>{error}</p>}
          <button
            type="button"
            className={styles.reportSend}
            onClick={() => void handleSend()}
            disabled={sending || comment.trim() === ''}
          >
            Отправить
          </button>
        </div>
      )}
    </Sheet>
  );
}
