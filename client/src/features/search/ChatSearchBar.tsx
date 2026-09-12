import type { KeyboardEvent } from 'react';

import { useChatSearchStore } from '../../stores/chatSearchStore';
import { GlassButton } from '../../ui/chrome/GlassButton';
import { Icon } from '../../ui/Icon';
import styles from './ChatSearchBar.module.css';

interface ChatSearchBarProps {
  onClose: () => void;
}

export function ChatSearchBar({ onClose }: ChatSearchBarProps) {
  const draft = useChatSearchStore((s) => s.draft);
  const setDraft = useChatSearchStore((s) => s.setDraft);
  const submit = useChatSearchStore((s) => s.submit);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.currentTarget.blur();
    submit();
  }

  return (
    <div className={styles.bar} role="search">
      <GlassButton variant="plain" icon="back" label="Выйти из поиска" onClick={onClose} />
      <Icon name="search" size={18} className={styles.icon} />
      <input
        className={styles.input}
        type="text"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (event.target.value.length === 0) submit({ jump: false });
        }}
        onKeyDown={handleKeyDown}
        placeholder="Поиск в чате"
        aria-label="Поиск в чате"
        autoComplete="off"
        enterKeyHint="search"
        autoFocus
      />
      {draft.length > 0 && (
        <GlassButton
          variant="plain"
          icon="close"
          label="Очистить поле"
          onClick={() => {
            setDraft('');
            submit({ jump: false });
          }}
        />
      )}
    </div>
  );
}
