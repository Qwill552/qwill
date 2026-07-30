import { type FormEvent, type KeyboardEvent, useState } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import styles from './MessageComposer.module.css';

export function MessageComposer({ chatId }: { chatId: string }) {
  const [value, setValue] = useState('');
  const sendMessage = useChatStore((s) => s.sendMessage);
  const user = useAuthStore((s) => s.user);

  function submit(): void {
    const content = value.trim();
    if (!content || !user) return;
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
        onChange={(e) => setValue(e.target.value)}
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
