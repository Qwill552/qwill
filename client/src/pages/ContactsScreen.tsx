import type { AvatarColor } from '@messenger/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { EmptyState } from '../features/chats/EmptyState';
import { isEmptyPrivateChat } from '../features/chats/visibleChats';
import { useChatStore } from '../stores/chatStore';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { SearchField } from '../ui/SearchField';
import { formatDayMonthShort, formatHourMinute } from '../utils/dateFormats';
import styles from './ContactsScreen.module.css';

interface Contact {
  chatId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  avatarColor: AvatarColor;
  online: boolean;
  lastSeenAt: string;
  /** Буква слева — пусто у всех, кроме первого контакта своей буквы (буквально из референса). */
  letter: string;
}

function formatStatus(contact: Contact): string {
  if (contact.online) return 'в сети';
  const date = new Date(contact.lastSeenAt);
  const today = new Date().toDateString() === date.toDateString();
  const time = formatHourMinute(date);
  if (today) return `был(а) в ${time}`;
  return `был(а) ${formatDayMonthShort(date)}`;
}

/** Буквально из референса (строка 154): иконка «пригласить» — человек + плюс. */
function InvitePersonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="7" r="3.3" stroke="#fff" strokeWidth="1.6" />
      <path d="M3.5 16c.6-2.8 2.8-4.2 5.5-4.2 1 0 1.9.2 2.7.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 12v5M12.5 14.5h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Буквально из референса (строка 161): трубка звонка. */
function CallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.2 3.4c0-.8.7-1.5 1.5-1.5h1.4c.6 0 1.1.4 1.3 1l.5 2c.1.5 0 1-.4 1.3l-.9.7a9 9 0 004 4l.7-.9c.3-.4.8-.5 1.3-.4l2 .5c.6.2 1 .7 1 1.3v1.4c0 .8-.7 1.5-1.5 1.5C6.6 14.3 2.2 9.9 2.2 3.4z"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Вкладка «Контакты». Отдельного списка контактов на сервере нет, поэтому список ниже
 *  собирается из собеседников по личным чатам — это настоящие связи, а не выдуманные данные.
 *
 *  Верхняя карточка-группа («Пригласить друзей» / «Недавние звонки», строки 151-165 референса)
 *  переносится буквально, хотя ни приглашений, ни звонков в приложении нет: по правилу CLAUDE.md
 *  «нет функции — переносится всё равно ровно как в источнике» строки не выдумывают замену
 *  и не подвязываются к чужой функции — это статичные, некликабельные ряды, реальный поиск
 *  человека остаётся на своём месте (кнопка «Написать» на вкладке «Сообщения»). */
export function ContactsScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const chats = useChatStore((s) => s.chats);
  const loadChats = useChatStore((s) => s.loadChats);
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  const hasContacts = useMemo(
    () => chats.some((chat) => chat.type === 'PRIVATE' && chat.otherMember && !isEmptyPrivateChat(chat)),
    [chats],
  );

  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted: Omit<Contact, 'letter'>[] = chats
      .filter((chat) => chat.type === 'PRIVATE' && chat.otherMember && !isEmptyPrivateChat(chat))
      .map((chat) => {
        const member = chat.otherMember!;
        return {
          chatId: chat.id,
          userId: member.id,
          name: member.displayName,
          avatarUrl: member.avatarUrl,
          avatarColor: member.avatarColor,
          online: presenceByUser[member.id]?.online ?? false,
          lastSeenAt: presenceByUser[member.id]?.lastSeenAt ?? member.lastSeenAt,
        };
      })
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    let prevLetter = '';
    return sorted.map((c): Contact => {
      const letter = c.name.charAt(0).toUpperCase();
      const shown = letter === prevLetter ? '' : letter;
      prevLetter = letter;
      return { ...c, letter: shown };
    });
  }, [chats, presenceByUser, query]);

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <h1 className={styles.title}>Контакты</h1>
        <SearchField value={query} onChange={setQuery} placeholder="Поиск контактов" />
      </div>

      <div ref={listRef} className={`${styles.list} ${isDesktop ? card.root : ''} hide-native-scrollbar`}>
        <ScrollIndicator target={listRef} />
        <Card className={styles.cardReset}>
          <div className={styles.entryRow}>
            <span className={`${styles.entryIcon} ${styles.entryIconBlue}`}>
              <InvitePersonIcon />
            </span>
            <span className={styles.entryTitle}>Пригласить друзей</span>
          </div>
          <div className={styles.entryDivider} />
          <div className={styles.entryRow}>
            <span className={`${styles.entryIcon} ${styles.entryIconGreen}`}>
              <CallIcon />
            </span>
            <span className={styles.entryTitle}>Недавние звонки</span>
          </div>
        </Card>

        {contacts.length > 0 && (
          <Card className={styles.cardReset}>
            <div className={styles.sectionLabel}>Сортировка по имени</div>
            {contacts.map((contact, index) => (
              <button
                key={contact.userId}
                type="button"
                className={styles.row}
                style={{ animationDelay: `${index * 0.04}s` }}
                onClick={() => navigate(`/chats/${contact.chatId}`)}
              >
                <span className={styles.letter} aria-hidden="true">
                  {contact.letter}
                </span>
                <Avatar label={contact.name} avatarUrl={contact.avatarUrl} size={42} color={contact.avatarColor} />
                <span className={styles.body}>
                  <span className={styles.name}>{contact.name}</span>
                  <span className={`${styles.status} ${contact.online ? styles.statusOnline : ''}`}>
                    {formatStatus(contact)}
                  </span>
                </span>
              </button>
            ))}
          </Card>
        )}

        {contacts.length === 0 &&
          (hasContacts ? (
            <EmptyState title="Никто не подходит" subtitle="Попробуйте другой запрос" />
          ) : (
            <EmptyState title="Пока никого нет" subtitle="Найдите человека — и он появится здесь" />
          ))}
      </div>
    </div>
  );
}
