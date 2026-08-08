import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useBackHandler } from '../app/useBackHandler';
import { Avatar } from '../ui/Avatar';
import { ChatWallpaper } from '../features/chat/ChatWallpaper';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { ForwardSheet } from '../features/messages/ForwardSheet';
import { GroupPanel } from '../features/groups/GroupPanel';
import { MessageComposer, type ComposerContext } from '../features/messages/MessageComposer';
import { MessageList } from '../features/messages/MessageList';
import { SelectionBar } from '../features/messages/SelectionBar';
import { SelectionHeader } from '../features/messages/SelectionHeader';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { formatLastSeen } from '../utils/presence';
import styles from './ChatScreen.module.css';

/** Буквально из референса (строка 296): отступ шапки от края и зазор между её кусками. */
const HEADER_STYLE = {
  padding: 'calc(6px + var(--safe-top)) calc(12px + var(--safe-right)) 10px calc(12px + var(--safe-left))',
  gap: '9px',
};

/** Буквально из референса (строка 357): композер — не полоса во всю ширину, а плавающая
 *  капсула с фиксированными полями по бокам. */
const COMPOSER_STYLE = {
  left: 'calc(14px + var(--safe-left))',
  right: 'calc(14px + var(--safe-right))',
  bottom: 'var(--composer-inset-bottom, calc(20px + var(--safe-bottom)))',
  padding: 0,
  gap: '10px',
  transition: 'bottom var(--dur-menu) var(--ease-screen)',
};

/** Экран одного чата: обои, лента во всю высоту, плавающая хрома и композер поверх неё.
 *  Буквальный перенос из «Пульс» (design-archive/reference), хрома — этап 2 CLAUDE.md. */
export function ChatScreen() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();

  const [composerContext, setComposerContext] = useState<ComposerContext | null>(null);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  /** Сообщения, для которых открыт шит выбора чата-получателя — из контекстного меню
   *  одной строки или из панели мультивыбора (ux-ui/06-message-interaction.md). */
  const [forwardRequest, setForwardRequest] = useState<number[] | null>(null);
  /** Высота композера отдаётся ленте в padding: он растёт вместе с текстом, и без
   *  измерения последние сообщения уезжали бы под него. */
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  const chats = useChatStore((s) => s.chats);
  const chatError = useChatStore((s) => s.chatError);
  const openChat = useChatStore((s) => s.openChat);
  const closeChat = useChatStore((s) => s.closeChat);
  const typingUsers = useChatStore((s) => (chatId ? s.typingByChat[chatId] : undefined)) ?? [];
  const presenceByUser = useChatStore((s) => s.presenceByUser);
  const kickedChatId = useChatStore((s) => s.kickedChatId);
  const clearKicked = useChatStore((s) => s.clearKicked);
  const messages = useChatStore((s) => (chatId ? s.messagesByChat[chatId] : undefined)) ?? [];
  const selectionMode = useChatStore((s) => s.selectionMode);
  const selectedIds = useChatStore((s) => s.selectedIds);
  const exitSelection = useChatStore((s) => s.exitSelection);
  const deleteMessagesBatch = useChatStore((s) => s.deleteMessagesBatch);
  /** Только чтобы знать, резервировать ли под баннер место в ленте (--pinned-h) — сам
   *  баннер рисует и владеет им `MessageList` (там же живут права на закреп/снятие),
   *  сюда он лишь порталится, чтобы не оказаться под блюром шапки (см. ниже, pinnedSlot). */
  const pinnedMessage = useChatStore((s) => (chatId ? s.pinnedByChat[chatId] : undefined)) ?? null;
  const myId = useAuthStore((s) => s.user?.id) ?? null;

  const selectedMessages = messages.filter((m) => selectedIds.has(m.id));

  /** Место под баннер закрепа — вне скроллящейся ленты, между размытой подложкой шапки
   *  (z-index 3) и самой шапкой (z-index 4): будучи ребёнком `.list` (z-index 2), баннер
   *  красился бы блюром `.headerFade` поверх себя и читался нечётко (см. журнал ux-ui.md,
   *  этап 6). Состояние, а не голый `useRef`, — `MessageList` порталит баннер в этот узел,
   *  а на первом рендере узла ещё нет; `useState` даёт лишний ре-рендер в момент коммита,
   *  когда узел появляется, и `MessageList` получает валидный контейнер, а не `null`. */
  const [pinnedSlot, setPinnedSlot] = useState<HTMLDivElement | null>(null);

  // Кнопка/жест «назад» выходит из мультивыбора раньше, чем уходит из чата (ux-ui/06,
  // «Готово когда»). Контекстное меню регистрируется отдельно, внутри MessageContextMenu —
  // оно открывается позже (из выбранной строки), поэтому в истории окажется выше и закроется первым.
  useBackHandler(selectionMode, exitSelection);

  useEffect(() => {
    if (!chatId) return;
    void openChat(chatId);
    return () => closeChat();
  }, [chatId, openChat, closeChat]);

  useEffect(() => {
    // Ответ/правка привязаны к открытому чату — при переходе в другой чат контекст неактуален.
    setComposerContext(null);
    setGroupPanelOpen(false);
    exitSelection();
  }, [chatId, exitSelection]);

  useEffect(() => {
    // Меня удалили из группы (или я вышел) — если это открытый чат, уходим из него (секция 8).
    if (!kickedChatId) return;
    if (kickedChatId === chatId) navigate('/chats', { replace: true });
    clearKicked();
  }, [kickedChatId, chatId, navigate, clearKicked]);

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setComposerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [chatId]);

  // Плашка обновления живёт в AppShell — другая ветка DOM, куда переменные с этого экрана
  // не наследуются, поэтому смещение публикуется на корне документа. Берётся фактическая
  // позиция композера, а не сумма переменных: она уже учитывает и safe-area, и подъём
  // композера при открытой панели эмодзи.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;

    const root = document.documentElement;
    const offset = window.innerHeight - el.getBoundingClientRect().top;
    root.style.setProperty('--update-banner-bottom', `calc(${Math.max(offset, 0)}px + var(--chrome-gap))`);

    return () => {
      root.style.removeProperty('--update-banner-bottom');
    };
  }, [composerHeight, emojiPanelOpen]);

  const activeChat = chats.find((c) => c.id === chatId);
  const isGroup = activeChat?.type === 'GROUP';
  const isTyping = typingUsers.length > 0;

  let subtitle: string | null = null;
  let subtitleTone: 'default' | 'online' | 'accent' = 'default';
  if (isTyping) {
    subtitle = isGroup ? `${typingUsers.map((u) => u.displayName).join(', ')} печатает…` : 'печатает…';
    subtitleTone = 'accent';
  } else if (isGroup) {
    subtitle = null;
  } else if (activeChat?.otherMember) {
    const presence = presenceByUser[activeChat.otherMember.id];
    if (presence?.online) {
      subtitle = 'в сети';
      subtitleTone = 'online';
    } else {
      subtitle = formatLastSeen(presence?.lastSeenAt ?? activeChat.otherMember.lastSeenAt);
    }
  }

  const canEditSelection =
    selectedMessages.length === 1 && selectedMessages[0]!.sender?.id === myId && !selectedMessages[0]!.deletedAt;

  function handleSelectionEdit(): void {
    const message = selectedMessages[0];
    if (!message) return;
    setComposerContext({ mode: 'edit', message });
    exitSelection();
  }

  function handleSelectionCopy(): void {
    const text = selectedMessages
      .map((m) => m.content)
      .filter((c): c is string => !!c)
      .join('\n');
    if (text) void navigator.clipboard.writeText(text).catch(() => {});
    exitSelection();
  }

  function handleSelectionDelete(): void {
    if (!chatId || selectedIds.size === 0) return;
    deleteMessagesBatch(chatId, [...selectedIds]).catch(() => {
      // Групповое удаление почти никогда не падает (свои сообщения/права уже проверены на входе в режим) — тихо не ломаем интерфейс.
    });
  }

  function handleSelectionReply(): void {
    const message = selectedMessages[0];
    if (!message) return;
    setComposerContext({ mode: 'reply', message });
    exitSelection();
  }

  if (!chatId) return null;

  if (chatError) {
    return (
      <div className={styles.screen}>
        <ChatWallpaper />
        <p className={styles.error}>{chatError}</p>
        <ChromeBar style={HEADER_STYLE}>
          <GlassButton icon="back" label="Назад к чатам" onClick={() => navigate('/chats')} />
        </ChromeBar>
      </div>
    );
  }

  return (
    <div
      className={styles.screen}
      style={{
        ...(composerHeight ? { ['--composer-h' as string]: `${composerHeight}px` } : undefined),
        ['--composer-inset-bottom' as string]: emojiPanelOpen
          ? 'calc(var(--emoji-panel-h) + var(--safe-bottom) + var(--chrome-gap))'
          : 'calc(20px + var(--safe-bottom))',
        // 8px зазор (--chrome-gap, см. ChatScreen.module.css → .pinnedSlot) + 48px сам баннер
        // (PinnedBanner.module.css → .banner) — держать в синхроне при правке любого из трёх мест.
        ['--pinned-h' as string]: pinnedMessage ? '56px' : '0px',
      }}
    >
      <ChatWallpaper />

      {/* Размытая подложка шапки — прогрессивный блюр (4 вложенных слоя нарастающей силы),
          см. комментарий в ChatScreen.module.css и журнал ux-ui.md. */}
      <div className={styles.headerFade}>
        <div className={styles.headerFadeLayer} />
        <div className={styles.headerFadeLayer} />
        <div className={styles.headerFadeLayer} />
        <div className={styles.headerFadeLayer} />
      </div>

      <MessageList
        chatId={chatId}
        isGroup={isGroup}
        typing={isTyping}
        emojiPanelOpen={emojiPanelOpen}
        onReply={(message) => setComposerContext({ mode: 'reply', message })}
        onEdit={(message) => setComposerContext({ mode: 'edit', message })}
        onForwardRequest={setForwardRequest}
        pinnedSlot={pinnedSlot}
      />

      {/* Крепится поверх .headerFade (z-index 4, между блюром и самой шапкой) — баннер
          читается чётко, а не сквозь размытие подложки. Содержимое порталит MessageList. */}
      <div className={styles.pinnedSlot} ref={setPinnedSlot} />

      <ChromeBar style={HEADER_STYLE}>
        {selectionMode ? (
          <SelectionHeader
            count={selectedIds.size}
            canEdit={canEditSelection}
            onClose={exitSelection}
            onEdit={handleSelectionEdit}
            onCopy={handleSelectionCopy}
            onForward={() => setForwardRequest([...selectedIds])}
            onDelete={handleSelectionDelete}
          />
        ) : (
          <>
            <GlassButton icon="back" label="Назад к чатам" onClick={() => navigate('/chats')} />
            <GlassPill
              variant="cap"
              title={activeChat?.title ?? '…'}
              subtitle={subtitle}
              subtitleTone={subtitleTone}
              leading={
                <Avatar
                  label={activeChat?.title ?? '?'}
                  avatarUrl={activeChat?.avatarUrl}
                  size={40}
                  color={activeChat?.otherMember?.avatarColor}
                  colorKey={chatId}
                />
              }
              onClick={() => (isGroup ? setGroupPanelOpen(true) : navigate(`/chats/${chatId}/info`))}
            />
            <GlassButton
              icon="more"
              label="Ещё"
              onClick={() => (isGroup ? setGroupPanelOpen(true) : navigate(`/chats/${chatId}/info`))}
            />
          </>
        )}
      </ChromeBar>

      {/* Размытая подложка композера — прогрессивный блюр, зеркально шапке. */}
      <div className={styles.composerFade}>
        <div className={styles.composerFadeLayer} />
        <div className={styles.composerFadeLayer} />
        <div className={styles.composerFadeLayer} />
        <div className={styles.composerFadeLayer} />
      </div>

      <ChromeBar side="bottom" style={COMPOSER_STYLE}>
        <div ref={composerRef} className={styles.composerSlot}>
          {selectionMode ? (
            <SelectionBar
              canReply={selectedIds.size === 1}
              onReply={handleSelectionReply}
              onForward={() => setForwardRequest([...selectedIds])}
            />
          ) : (
            <MessageComposer
              chatId={chatId}
              context={composerContext}
              onClearContext={() => setComposerContext(null)}
              onEmojiPanelToggle={setEmojiPanelOpen}
            />
          )}
        </div>
      </ChromeBar>

      {groupPanelOpen && <GroupPanel chatId={chatId} onClose={() => setGroupPanelOpen(false)} />}

      {forwardRequest && (
        <ForwardSheet
          fromChatId={chatId}
          messageIds={forwardRequest}
          onClose={() => setForwardRequest(null)}
          onForwarded={exitSelection}
        />
      )}
    </div>
  );
}
