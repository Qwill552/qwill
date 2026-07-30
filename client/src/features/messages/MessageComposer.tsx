import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import styles from './MessageComposer.module.css';

/** Меньше TYPING_TIMEOUT_MS (5с) — явный stop почти всегда опережает автогашение у получателя (секция 3). */
const TYPING_STOP_DELAY_MS = 3000;

export function MessageComposer({ chatId }: { chatId: string }) {
  const [value, setValue] = useState('');
  const sendMessage = useChatStore((s) => s.sendMessage);
  const startTyping = useChatStore((s) => s.startTyping);
  const stopTyping = useChatStore((s) => s.stopTyping);
  const user = useAuthStore((s) => s.user);

  const isTypingRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
        className={styles.input}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Написать сообщение…"
        rows={1}
      />
      <button className={styles.send} type="submit" disabled={!value.trim()}>
        Отправить
      </button>
    </form>
  );
}
