import { useState } from 'react';

import { useChatStore } from '../../stores/chatStore';
import { Avatar } from '../../ui/Avatar';
import { Card } from '../../ui/Card';
import { Sheet } from '../../ui/Sheet';
import { Spinner } from '../../ui/Spinner';
import { isServiceChat } from '../chat/serviceChat';
import styles from './ForwardSheet.module.css';

interface ForwardSheetProps {
  fromChatId: string;
  messageIds: number[];
  onClose: () => void;
  onForwarded: () => void;
}

/** Шит выбора чата-получателя — «Переслать» из контекстного меню и мультивыбора
 *  (ux-ui/06-message-interaction.md). Список — уже загруженные чаты, без отдельного поиска:
 *  тот же объём, что у остальных пикеров этого этапа (@username-форма, а не полнотекстовый
 *  поиск людей — этап 4). */
export function ForwardSheet({ fromChatId, messageIds, onClose, onForwarded }: ForwardSheetProps) {
  const chats = useChatStore((s) => s.chats);
  const forwardMessages = useChatStore((s) => s.forwardMessages);
  const targets = chats.filter((chat) => !isServiceChat(chat));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(toChatId: string): Promise<void> {
    if (pendingId) return;
    setPendingId(toChatId);
    setError(null);
    try {
      await forwardMessages(fromChatId, toChatId, messageIds);
      onForwarded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось переслать');
      setPendingId(null);
    }
  }

  return (
    <Sheet title="Переслать" onClose={onClose}>
      {error && <p className={styles.error}>{error}</p>}
      <Card>
        {targets.map((chat) => (
          <Card.Row
            key={chat.id}
            title={chat.title}
            leading={
              <Avatar
                label={chat.title}
                avatarUrl={chat.avatarUrl}
                size={44}
                color={chat.otherMember?.avatarColor}
                colorKey={chat.id}
              />
            }
            trailing={pendingId === chat.id ? <Spinner size={18} /> : undefined}
            chevron={false}
            onClick={() => void handlePick(chat.id)}
          />
        ))}
      </Card>
    </Sheet>
  );
}
