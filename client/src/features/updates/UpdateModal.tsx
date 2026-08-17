import { useState } from 'react';

import {
  selectUpdateRequired,
  useAppUpdateStore,
} from '../../app/appUpdate';
import { formatBytes } from '../messages/Attachment';
import { Icon } from '../../ui/Icon';
import { Modal } from '../groups/Modal';
import styles from './UpdateModal.module.css';

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ progress }: { progress: number }) {
  return (
    <div className={styles.progress}>
      <svg className={styles.ring} viewBox="0 0 64 64" aria-hidden="true">
        <circle className={styles.ringTrack} cx="32" cy="32" r={RING_RADIUS} />
        <circle
          className={styles.ringFill}
          cx="32"
          cy="32"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
        />
      </svg>
      <span className={styles.percent}>{Math.round(progress * 100)}%</span>
    </div>
  );
}

function PermissionStep({ onGo, onBack }: { onGo: () => void; onBack: (() => void) | null }) {
  return (
    <div className={styles.permission}>
      <span className={styles.permissionIcon}>
        <Icon name="shield" size={28} />
      </span>
      <p className={styles.permissionText}>
        Android разрешает приложениям устанавливать другие приложения только по отдельному запросу. Включите
        «Установка неизвестных приложений» для Qwill — этот тумблер нужен один раз, дальше обновления будут
        ставиться сразу.
      </p>
      <button type="button" className={styles.primaryButton} onClick={onGo}>
        Перейти в настройки
      </button>
      {onBack && (
        <button type="button" className={styles.secondaryButton} onClick={onBack}>
          Назад
        </button>
      )}
    </div>
  );
}

function UpdateBody({ blocking }: { blocking: boolean }) {
  const info = useAppUpdateStore((s) => s.info);
  const phase = useAppUpdateStore((s) => s.phase);
  const percent = useAppUpdateStore((s) => s.percent);
  const error = useAppUpdateStore((s) => s.error);
  const permissionRequired = useAppUpdateStore((s) => s.permissionRequired);
  const download = useAppUpdateStore((s) => s.download);
  const cancel = useAppUpdateStore((s) => s.cancel);
  const install = useAppUpdateStore((s) => s.install);
  const requestPermission = useAppUpdateStore((s) => s.requestPermission);
  const reset = useAppUpdateStore((s) => s.reset);

  const [explainingPermission, setExplainingPermission] = useState(false);

  if (!info) return null;

  if (explainingPermission || (permissionRequired && phase === 'ready')) {
    return (
      <PermissionStep
        onGo={() => {
          setExplainingPermission(false);
          void requestPermission();
        }}
        onBack={explainingPermission ? () => setExplainingPermission(false) : null}
      />
    );
  }

  return (
    <>
      {blocking && (
        <p className={styles.blockingNote}>
          Эта версия Qwill устарела и больше не поддерживается. Установите новую версию, чтобы продолжить.
        </p>
      )}

      <p className={styles.meta}>
        Версия {info.versionName} · {formatBytes(info.sizeBytes)}
      </p>

      {info.changelog.length > 0 && (
        <>
          <h3 className={styles.changelogTitle}>Что нового</h3>
          <ul className={styles.changelog}>
            {info.changelog.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}

      {phase === 'downloading' && <ProgressRing progress={percent} />}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        {phase === 'downloading' && (
          <button type="button" className={styles.secondaryButton} onClick={() => void cancel()}>
            Отменить
          </button>
        )}

        {phase === 'ready' && (
          <button type="button" className={styles.primaryButton} onClick={() => void install()}>
            Установить
          </button>
        )}

        {(phase === 'idle' || phase === 'checking') && (
          <button type="button" className={styles.primaryButton} onClick={() => void download()}>
            Скачать
          </button>
        )}

        {phase === 'error' && (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              reset();
              void download();
            }}
          >
            Повторить
          </button>
        )}
      </div>

      {phase !== 'downloading' && (
        <button type="button" className={styles.linkButton} onClick={() => setExplainingPermission(true)}>
          Почему нужно разрешение на установку?
        </button>
      )}
    </>
  );
}

/** Обновление предлагается — модалку можно закрыть и продолжить пользоваться приложением. */
export function UpdateModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Обновление" onClose={onClose} opaque>
      <UpdateBody blocking={false} />
    </Modal>
  );
}

/** Версия ниже минимальной — закрыть нечем, единственный выход отсюда наружу: обновиться. */
export function RequiredUpdateModal() {
  const required = useAppUpdateStore(selectUpdateRequired);
  if (!required) return null;

  return (
    <div className={styles.blockingOverlay} role="dialog" aria-modal="true" aria-label="Требуется обновление">
      <div className={styles.blockingCard}>
        <UpdateBody blocking />
      </div>
    </div>
  );
}
