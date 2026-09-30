import type { GroupMemberDTO } from '@messenger/shared';
import { useEffect, useMemo, useState } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { Avatar } from '../../ui/Avatar';
import { cssDurationMs } from '../../ui/motion';
import { highlight } from './highlight';
import { filterMembers } from './memberSuggest';
import styles from './ChatSearchMembers.module.css';

interface ChatSearchMembersProps {
  chatId: string;
  query: string;
  visible: boolean;
  onPick: (member: GroupMemberDTO) => void;
}

export function ChatSearchMembers({ chatId, query, visible, onPick }: ChatSearchMembersProps) {
  const members = useChatStore((s) => s.membersByChat[chatId]);
  const messages = useChatStore((s) => s.messagesByChat[chatId]);
  const myId = useAuthStore((s) => s.user?.id) ?? null;

  const recentAuthors = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
      const id = messages![index]!.sender?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }, [messages]);

  const suggestions = useMemo(
    () => (visible ? filterMembers(members, query, recentAuthors, myId) : []),
    [visible, members, query, recentAuthors, myId],
  );

  const shown = visible && suggestions.length > 0;
  const [rendered, setRendered] = useState<GroupMemberDTO[]>(suggestions);

  useEffect(() => {
    if (shown) {
      setRendered(suggestions);
      return;
    }
    const timer = window.setTimeout(() => setRendered([]), cssDurationMs('--dur-close'));
    return () => window.clearTimeout(timer);
  }, [shown, suggestions]);

  const list = shown ? suggestions : rendered;
  if (list.length === 0) return null;

  return (
    <div className={`${styles.card} ${shown ? styles.opening : styles.closing}`} role="listbox" aria-label="Участники">
      {list.map((member) => (
        <button
          key={member.userId}
          type="button"
          role="option"
          aria-selected="false"
          className={styles.row}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(member)}
        >
          <Avatar
            label={member.displayName || member.username}
            avatarUrl={member.avatarUrl}
            size={32}
            color={member.avatarColor}
            colorKey={member.userId}
          />
          <span className={styles.text}>
            <span className={styles.name}>{highlight(member.displayName, query)}</span>
            <span className={styles.handle}>@{member.username}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
