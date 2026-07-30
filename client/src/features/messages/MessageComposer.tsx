import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import styles from './MessageComposer.module.css';

/** Меньше TYPING_TIMEOUT_MS (5с) — явный stop почти всегда опережает автогашение у получателя (секция 3). */
const TYPING_STOP_DELAY_MS = 3000;
/** Совпадает с max-height в CSS — иначе авторасширение упрётся в обрезанный textarea раньше скролла. */
const INPUT_MAX_HEIGHT_PX = 120;

export function MessageComposer({ chatId }: { chatId: string }) {
  const [value, setValue] = useState('');
  const sendMessage = useChatStore((s) => s.sendMessage);
  const startTyping = useChatStore((s) => s.startTyping);
  const stopTyping = useChatStore((s) => s.stopTyping);
  const user = useAuthStore((s) => s.user);

  const isTypingRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!content || !user) return;
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

  return (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className={styles.input}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Написать сообщение…"
        rows={1}
      />
      <button className={styles.send} type="submit" disabled={!value.trim()} aria-label="Отправить">
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
  );
}
