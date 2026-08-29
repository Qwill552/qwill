import { CARD_IMAGE_EXTENSIONS, toSafeCardImageName, type CardImageDto } from '@messenger/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { ApiError } from '../../api/client';
import { deleteCardImageRequest, listCardImagesRequest, uploadCardImageRequest } from '../../api/users';
import { Modal } from '../groups/Modal';
import styles from './CardImagePanel.module.css';

const ACCEPT = CARD_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(',');
const COPIED_FLASH_MS = 1600;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toLocaleString('ru-RU')} МБ`;
}

interface PendingUpload {
  file: File;
  name: string;
  replace: boolean;
}

export function CardImagePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<CardImageDto[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [maxBytes, setMaxBytes] = useState(0);
  const [maxCount, setMaxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ name: string; label: string } | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCardImagesRequest()
      .then((list) => {
        if (cancelled) return;
        setImages(list.images);
        setTotalBytes(list.totalBytes);
        setMaxBytes(list.maxBytes);
        setMaxCount(list.maxCount);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не удалось загрузить список картинок');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload(): Promise<void> {
    const list = await listCardImagesRequest();
    setImages(list.images);
    setTotalBytes(list.totalBytes);
    setMaxBytes(list.maxBytes);
    setMaxCount(list.maxCount);
  }

  async function copy(text: string, name: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ name, label });
      window.setTimeout(
        () => setCopied((current) => (current?.name === name && current.label === label ? null : current)),
        COPIED_FLASH_MS,
      );
    } catch {
      setError('Браузер не дал скопировать — выделите путь вручную');
    }
  }

  function handleFileChosen(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setPending({ file, name: toSafeCardImageName(file.name), replace: false });
  }

  async function handleUpload(): Promise<void> {
    if (!pending) return;
    setUploading(true);
    setError(null);
    try {
      await uploadCardImageRequest(pending.name, pending.file, pending.replace);
      await reload();
      setPending(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setPending({ ...pending, replace: true });
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить картинку');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(name: string): Promise<void> {
    setDeleting(null);
    setError(null);
    try {
      await deleteCardImageRequest(name);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить картинку');
    }
  }

  return (
    <section className={styles.panel} aria-label="Мои картинки">
      <header className={styles.head}>
        <span className={styles.counter}>
          {images.length} из {maxCount} · {formatBytes(totalBytes)} из {formatBytes(maxBytes)}
        </span>
        <button type="button" className={styles.upload} onClick={() => inputRef.current?.click()}>
          Загрузить
        </button>
      </header>

      <input ref={inputRef} className={styles.hiddenInput} type="file" accept={ACCEPT} onChange={handleFileChosen} />

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p className={styles.empty}>Загружаем список…</p>
      ) : images.length === 0 ? (
        <p className={styles.empty}>Пока пусто. Загрузите картинку — и вставляйте её в код визитки.</p>
      ) : (
        <ul className={styles.grid}>
          {images.map((image) => (
            <li key={image.name} className={styles.tile}>
              <div className={styles.previewWrap}>
                <button
                  type="button"
                  className={styles.preview}
                  onClick={() => void copy(`img/${image.name}`, image.name, 'Путь скопирован!')}
                  aria-label={`Скопировать путь img/${image.name}`}
                >
                  <img className={styles.thumb} src={image.url} alt="" loading="lazy" />
                </button>
                {copied?.name === image.name && (
                  <span className={styles.bubble} role="status">
                    {copied.label}
                  </span>
                )}
              </div>
              <span className={styles.name} title={image.name}>
                {image.name}
              </span>
              <span className={styles.meta}>
                {image.width}×{image.height} · {formatBytes(image.bytes)}
              </span>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => void copy(`<img src="img/${image.name}" alt="">`, image.name, 'Тег скопирован!')}
                >
                  ⧉ тег
                </button>
                <button
                  type="button"
                  className={`${styles.action} ${styles.danger}`}
                  onClick={() => setDeleting(image.name)}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.hint}>
        Пути указываются относительно вашей папки. Картинки других пользователей и внешние адреса
        браузер заблокирует.
      </p>
      <p className={styles.hint}>
        Картинку видит каждый, кто знает адрес, — она и так показывается в открытом профиле. Не место
        для личных фотографий.
      </p>

      {pending && (
        <Modal title={pending.replace ? 'Заменить картинку?' : 'Имя картинки'} onClose={() => setPending(null)}>
          <label className={styles.fieldLabel} htmlFor="card-image-name">
            Под этим именем картинка будет доступна в коде: <code>img/{pending.name}</code>
          </label>
          <input
            id="card-image-name"
            className={styles.field}
            type="text"
            value={pending.name}
            maxLength={64}
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
            onChange={(e) => setPending({ ...pending, name: e.target.value.toLowerCase(), replace: false })}
          />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancel} onClick={() => setPending(null)}>
              Отмена
            </button>
            <button type="button" className={styles.confirm} onClick={() => void handleUpload()} disabled={uploading}>
              {uploading ? 'Загружаем…' : pending.replace ? 'Заменить' : 'Загрузить'}
            </button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Удалить картинку?" onClose={() => setDeleting(null)}>
          <p className={styles.confirmText}>
            «{deleting}» будет удалена без возможности вернуть. Места в визитке, где на неё ссылались,
            останутся пустыми.
          </p>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancel} onClick={() => setDeleting(null)}>
              Отмена
            </button>
            <button
              type="button"
              className={`${styles.confirm} ${styles.confirmDanger}`}
              onClick={() => void handleDelete(deleting)}
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
