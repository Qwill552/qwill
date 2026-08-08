import type { AvatarColor, MessageReactionDto } from '@messenger/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { Avatar } from '../../ui/Avatar';
import { useLongPress } from '../../ui/gestures/useLongPress';
import { haptic } from '../../ui/haptic';
import { Sheet } from '../../ui/Sheet';
import { Emoji } from '../emoji/Emoji';
import styles from './MessageReactions.module.css';

interface MemberInfo {
  displayName: string;
  avatarUrl: string | null;
  avatarColor: AvatarColor;
}

function useMemberResolver(chatId: string): Map<string, MemberInfo> {
  const own = useAuthStore((s) => s.user);
  const chats = useChatStore((s) => s.chats);
  const groupMembers = useChatStore((s) => s.membersByChat[chatId]);

  return useMemo(() => {
    const map = new Map<string, MemberInfo>();
    if (own) map.set(own.id, { displayName: own.displayName, avatarUrl: own.avatarUrl, avatarColor: own.avatarColor });
    const otherMember = chats.find((c) => c.id === chatId)?.otherMember;
    if (otherMember) {
      map.set(otherMember.id, {
        displayName: otherMember.displayName,
        avatarUrl: otherMember.avatarUrl,
        avatarColor: otherMember.avatarColor,
      });
    }
    groupMembers?.forEach((member) => {
      map.set(member.userId, {
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        avatarColor: member.avatarColor,
      });
    });
    return map;
  }, [own, chats, chatId, groupMembers]);
}

function stopPointerBubble(event: React.PointerEvent): void {
  event.stopPropagation();
}

function ReactionChip({
  reaction,
  mine,
  bumping,
  onToggle,
  onShowReactors,
}: {
  reaction: MessageReactionDto;
  mine: boolean;
  bumping: boolean;
  onToggle: () => void;
  onShowReactors: () => void;
}) {
  const suppressClickRef = useRef(false);

  const longPress = useLongPress({
    onLongPress: () => {
      suppressClickRef.current = true;
      haptic();
      onShowReactors();
    },
  });

  function handlePointerDown(event: React.PointerEvent): void {
    stopPointerBubble(event);
    longPress.onPointerDown(event);
  }

  function handleClick(): void {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onToggle();
  }

  const label = `${reaction.emoji} — ${mine ? 'убрать вашу реакцию' : 'поставить реакцию'} (${reaction.userIds.length})`;

  return (
    <button
      type="button"
      className={`${styles.pill} ${mine ? styles.pillMine : ''} ${bumping ? styles.bump : ''}`}
      title={label}
      aria-label={label}
      onPointerDown={handlePointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={(event) => {
        stopPointerBubble(event);
        longPress.onPointerUp();
      }}
      onPointerCancel={(event) => {
        stopPointerBubble(event);
        longPress.onPointerCancel();
      }}
      onClick={handleClick}
    >
      <Emoji emoji={reaction.emoji} size={16} />
      <span key={reaction.userIds.length} className={`${styles.count} ${styles.countRoll}`}>
        {reaction.userIds.length}
      </span>
    </button>
  );
}

export function MessageReactions({
  reactions,
  myId,
  chatId,
  onToggle,
}: {
  reactions: MessageReactionDto[];
  myId: string | null;
  chatId: string;
  onToggle: (emoji: string) => void;
}) {
  const members = useMemberResolver(chatId);
  const prevCounts = useRef<Map<string, number>>(new Map());
  const [bumping, setBumping] = useState<Set<string>>(new Set());
  const [reactorsFor, setReactorsFor] = useState<MessageReactionDto | null>(null);

  useEffect(() => {
    const next = new Map(reactions.map((r) => [r.emoji, r.userIds.length]));
    const bumped = new Set<string>();
    next.forEach((count, emoji) => {
      if (count > (prevCounts.current.get(emoji) ?? 0)) bumped.add(emoji);
    });
    prevCounts.current = next;
    if (bumped.size === 0) return;
    setBumping(bumped);
    const timer = setTimeout(() => setBumping(new Set()), 320);
    return () => clearTimeout(timer);
  }, [reactions]);

  if (reactions.length === 0) return null;

  return (
    <div className={styles.row}>
      {reactions.map((reaction) => (
        <ReactionChip
          key={reaction.emoji}
          reaction={reaction}
          mine={!!myId && reaction.userIds.includes(myId)}
          bumping={bumping.has(reaction.emoji)}
          onToggle={() => onToggle(reaction.emoji)}
          onShowReactors={() => setReactorsFor(reaction)}
        />
      ))}

      {reactorsFor && (
        <Sheet title={reactorsFor.emoji} onClose={() => setReactorsFor(null)}>
          {reactorsFor.userIds.map((userId) => {
            const member = members.get(userId);
            return (
              <div key={userId} className={styles.reactorRow}>
                <Avatar
                  label={member?.displayName ?? '?'}
                  avatarUrl={member?.avatarUrl}
                  color={member?.avatarColor}
                  colorKey={userId}
                  size={36}
                />
                <span className={styles.reactorName}>{member?.displayName ?? 'Пользователь'}</span>
              </div>
            );
          })}
        </Sheet>
      )}
    </div>
  );
}
