import { ALLOWED_MIME_TYPES, type MessageAttachmentInput } from '@messenger/shared';
import { type ChangeEvent, type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { ApiError } from '../../api/client';
import { generateImageThumbnail, generateVideoThumbnail, uploadFile } from '../../api/files';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import styles from './MessageComposer.module.css';

/** Меньше TYPING_TIMEOUT_MS (5с) — явный stop почти всегда опережает автогашение у получателя (секция 3). */
const TYPING_STOP_DELAY_MS = 3000;
/** Совпадает с max-height в CSS — иначе авторасширение упрётся в обрезанный textarea раньше скролла. */
const INPUT_MAX_HEIGHT_PX = 120;

interface PendingUpload {
  name: string;
  stage: 'превью' | 'загрузка';
  progress: number;
}

export function MessageComposer({ chatId }: { chatId: string }) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const startTyping = useChatStore((s) => s.startTyping);
  const stopTyping = useChatStore((s) => s.stopTyping);
  const user = useAuthStore((s) => s.user);

  const isTypingRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Авторасширение по содержимому до INPUT_MAX_HEIGHT_PX, дальше — собственный скролл textarea.
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
  }, [value]);

  useEffect(() => {
    // Смена чата или уход со страницы — сообщаем «перестал печатать» в прежнем чате.
    return () => {
      clearTimeout(stopTimerRef.current);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        stopTyping(chatId);
      }
    };
  }, [chatId, stopTyping]);

  function markStopped(): void {
    clearTimeout(stopTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping(chatId);
    }
  }

  function handleChange(next: string): void {
    setValue(next);

    if (!next.trim()) {
      markStopped();
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      startTyping(chatId);
    }
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(markStopped, TYPING_STOP_DELAY_MS);
  }

  function submit(): void {
    const content = value.trim();
    if (!content || !user || pending) return;
    markStopped();
    sendMessage(chatId, content, user);
    setValue('');
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;

    markStopped();
    setError(null);
    setPending({ name: file.name, stage: 'превью', progress: 0 });

    try {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      const videoThumb = isVideo ? await generateVideoThumbnail(file) : null;
      const thumb = isImage ? await generateImageThumbnail(file) : videoThumb;

      let thumbnailFileId: string | undefined;
      let thumbnailSha256: string | undefined;
      if (thumb) {
        const uploadedThumb = await uploadFile(thumb.file, 'message');
        thumbnailFileId = uploadedThumb.id;
        thumbnailSha256 = uploadedThumb.sha256;
      }

      setPending({ name: file.name, stage: 'загрузка', progress: 0 });
      const uploaded = await uploadFile(file, 'message', (loaded, total) => {
        setPending({ name: file.name, stage: 'загрузка', progress: total ? loaded / total : 0 });
      });

      const attachment: MessageAttachmentInput = {
        fileId: uploaded.id,
        sha256: uploaded.sha256,
        thumbnailFileId,
        thumbnailSha256,
        originalName: file.name,
        width: thumb?.width,
        height: thumb?.height,
        duration: videoThumb?.duration,
      };

      sendMessage(chatId, value.trim(), user, attachment);
      setValue('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить файл');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.wrap}>
      {pending && (
        <div className={styles.upload}>
          <span className={styles.uploadName}>
            {pending.stage === 'превью' ? 'Готовим превью…' : pending.name}
          </span>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${Math.round(pending.progress * 100)}%` }} />
          </div>
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}

      <form className={styles.composer} onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          className={styles.hiddenInput}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(',')}
          onChange={(e) => void handleFileSelected(e)}
        />
        <button
          className={styles.attach}
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!pending}
          aria-label="Прикрепить файл"
          title="Прикрепить файл"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M8 12.5V7a4 4 0 1 1 8 0v9a2.5 2.5 0 0 1-5 0V8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Написать сообщение…"
          rows={1}
        />
        <button className={styles.send} type="submit" disabled={!value.trim() || !!pending} aria-label="Отправить">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 12.5 20 4l-5.5 16-3.5-6.5L4 12.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}
