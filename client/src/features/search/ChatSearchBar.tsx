import type { KeyboardEvent, RefObject } from 'react';

import { useChatSearchStore } from '../../stores/chatSearchStore';
import { useChatStore } from '../../stores/chatStore';
import { GlassButton } from '../../ui/chrome/GlassButton';
import { Icon } from '../../ui/Icon';
import { captionName } from './memberSuggest';
import styles from './ChatSearchBar.module.css';

interface ChatSearchBarProps {
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function ChatSearchBar({ onClose, inputRef }: ChatSearchBarProps) {
  const chatId = useChatSearchStore((s) => s.chatId);
  const draft = useChatSearchStore((s) => s.draft);
  const picking = useChatSearchStore((s) => s.picking);
  const fromUserId = useChatSearchStore((s) => s.fromUserId);
  const setDraft = useChatSearchStore((s) => s.setDraft);
  const submit = useChatSearchStore((s) => s.submit);
  const clearCaption = useChatSearchStore((s) => s.clearCaption);
  const fromMember = useChatStore((s) =>
    chatId && fromUserId ? s.membersByChat[chatId]?.find((member) => member.userId === fromUserId) : undefined,
  );

  const captioned = picking || fromUserId !== null;
  const placeholder = fromUserId ? '' : picking ? 'Поиск участников' : 'Поиск в чате';
  const clearShown = draft.length > 0 || captioned;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Backspace' && event.currentTarget.value.length === 0 && captioned) {
      event.preventDefault();
      clearCaption();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (picking) return;
    event.currentTarget.blur();
    submit();
  }

  function handleClear(): void {
    if (draft.length > 0) {
      setDraft('');
      submit({ jump: false });
    } else {
      clearCaption();
    }
    inputRef.current?.focus();
  }

  return (
    <div className={styles.bar} role="search">
      <GlassButton icon="back" label="Выйти из поиска" onClick={onClose} />

      <div className={styles.field}>
        <Icon name="search" size={18} className={styles.icon} />
        {captioned && (
          <span className={styles.caption}>
            От:
            {fromMember && <span className={styles.captionName}> {captionName(fromMember)}</span>}
          </span>
        )}
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (event.target.value.length === 0) submit({ jump: false });
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={fromMember ? `Поиск в сообщениях: ${fromMember.displayName}` : picking ? 'Поиск участников' : 'Поиск в чате'}
          autoComplete="off"
          enterKeyHint="search"
          autoFocus
        />
      </div>

      <span className={`${styles.clear} ${clearShown ? '' : styles.clearHidden}`} aria-hidden={!clearShown}>
        <GlassButton
          icon="close"
          label="Очистить поле"
          tabIndex={clearShown ? 0 : -1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClear}
        />
      </span>
    </div>
  );
}
