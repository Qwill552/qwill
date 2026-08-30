import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { useEscapeKey } from '../app/hotkeys';
import { useBackHandler } from '../app/useBackHandler';
import { useLayoutMode } from '../app/useLayoutMode';
import { Avatar } from '../ui/Avatar';
import { ChatWallpaper } from '../features/chat/ChatWallpaper';
import { OfficialMark } from '../features/chat/OfficialMark';
import { ServiceChatBar } from '../features/chat/ServiceChatBar';
import { isServiceChat, SERVICE_AVATAR_SRC } from '../features/chat/serviceChat';
import { DeleteChatModal } from '../features/chats/DeleteChatModal';
import { openAvatarViewer } from '../features/media/avatarViewerStore';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { Menu, type MenuItem } from '../ui/Menu';
import { GroupCallBanner } from '../features/calls/GroupCallBanner';
import { ForwardSheet } from '../features/messages/ForwardSheet';
import { GroupPanel } from '../features/groups/GroupPanel';
import { DeleteMessageModal } from '../features/messages/DeleteMessageModal';
import { MessageComposer, type ComposerContext } from '../features/messages/MessageComposer';
import { isDeletableSelection } from '../features/messages/messageDeleting';
import { isEditableMessage } from '../features/messages/messageEditing';
import { MessageList } from '../features/messages/MessageList';
import { SelectionBar } from '../features/messages/SelectionBar';
import { SelectionHeader } from '../features/messages/SelectionHeader';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import { type LocalMessage, useChatStore } from '../stores/chatStore';
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

/** Десктоп (ux-ui/14-desktop/03-chat-column-chrome.md): шапка — сплошная полоса 60px
 *  во всю ширину колонки, без полей по бокам. */
const DESKTOP_HEADER_STYLE = {
  padding: '0 16px',
  gap: '12px',
  height: '60px',
};

/** Десктоп: композер остаётся капсулой, но сама полоса — во всю ширину колонки; клэмп
 *  до 860px и центрирование даёт `.composerSlot` (ChatScreen.module.css). */
const DESKTOP_COMPOSER_STYLE = {
  left: 0,
  right: 0,
  bottom: 'var(--composer-inset-bottom, calc(20px + var(--safe-bottom)))',
  padding: '10px 0 16px',
  gap: 0,
  transition: 'bottom var(--dur-menu) var(--ease-screen)',
};

const CALL_BANNER_H = 52;

/** Экран одного чата: обои, лента во всю высоту, плавающая хрома и композер поверх неё.
 *  Буквальный перенос из «Пульс» (design-archive/reference), хрома — этап 2 CLAUDE.md. */
export function ChatScreen() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  /** Меню чата в списке умеет открыть профиль группы, а живёт панель группы здесь —
   *  переход приносит просьбу открыть её вместе с навигацией. */
  const openPanelRequested = (useLocation().state as { openPanel?: boolean } | null)?.openPanel === true;

  const [composerContext, setComposerContext] = useState<ComposerContext | null>(null);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [headerMenuAnchor, setHeaderMenuAnchor] = useState<DOMRect | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectionDeleteConfirm, setSelectionDeleteConfirm] = useState(false);
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
  const setChatMuted = useChatStore((s) => s.setChatMuted);
  /** Только чтобы знать, резервировать ли под баннер место в ленте (--pinned-h) — сам
   *  баннер рисует и владеет им `MessageList` (там же живут права на закреп/снятие),
   *  сюда он лишь порталится, чтобы не оказаться под блюром шапки (см. ниже, pinnedSlot). */
  const pinnedMessage = useChatStore((s) => (chatId ? s.pinnedByChat[chatId] : undefined)) ?? null;
  const members = useChatStore((s) => (chatId ? s.membersByChat[chatId] : undefined));
  const myId = useAuthStore((s) => s.user?.id) ?? null;
  const startCall = useCallStore((s) => s.startCall);
  const joinCall = useCallStore((s) => s.joinCall);
  const myCallId = useCallStore((s) => s.call?.id ?? null);
  const activeCallByChat = useChatStore((s) => s.activeCallByChat);

  const selectedMessages = messages.filter((m) => selectedIds.has(m.id));

  /** Место под баннер закрепа — вне скроллящейся ленты, между размытой подложкой шапки
   *  (z-index 3) и самой шапкой (z-index 4): будучи ребёнком `.list` (z-index 2), баннер
   *  красился бы блюром `.headerFade` поверх себя и читался нечётко (см. журнал ux-ui.md,
   *  этап 6). Состояние, а не голый `useRef`, — `MessageList` порталит баннер в этот узел,
   *  а на первом рендере узла ещё нет; `useState` даёт лишний ре-рендер в момент коммита,
   *  когда узел появляется, и `MessageList` получает валидный контейнер, а не `null`. */
  const [pinnedSlot, setPinnedSlot] = useState<HTMLDivElement | null>(null);

  const handleReply = useCallback((message: LocalMessage) => setComposerContext({ mode: 'reply', message }), []);
  const handleEdit = useCallback((message: LocalMessage) => setComposerContext({ mode: 'edit', message }), []);

  const handleEditLast = useCallback(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]!;
      if (message.sender?.id !== myId || message.id <= 0 || message.deletedAt) continue;
      if (!isEditableMessage(message)) continue;
      setComposerContext({ mode: 'edit', message });
      return;
    }
  }, [messages, myId]);

  // Кнопка/жест «назад» выходит из мультивыбора раньше, чем уходит из чата (ux-ui/06,
  // «Готово когда»). Контекстное меню регистрируется отдельно, внутри MessageContextMenu —
  // оно открывается позже (из выбранной строки), поэтому в истории окажется выше и закроется первым.
  useBackHandler(selectionMode, exitSelection);
  useEscapeKey(selectionMode, exitSelection);

  useEffect(() => {
    if (!chatId) return;
    void openChat(chatId);
    return () => closeChat();
  }, [chatId, openChat, closeChat]);

  useEffect(() => {
    // Ответ/правка привязаны к открытому чату — при переходе в другой чат контекст неактуален.
    setComposerContext(null);
    setGroupPanelOpen(openPanelRequested);
    setHeaderMenuAnchor(null);
    exitSelection();
  }, [chatId, exitSelection, openPanelRequested]);

  useEffect(() => {
    // Отвечали/редактировали сообщение, которое тем временем удалили (своё действие или
    // с другого устройства/собеседником) — контекст композера сбрасывается (R-15).
    if (composerContext && !messages.some((m) => m.id === composerContext.message.id)) {
      setComposerContext(null);
    }
  }, [messages, composerContext]);

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
  const isService = isServiceChat(activeChat);
  const isSupportChat = activeChat?.isSupportRequest === true;
  const muted = activeChat?.muted ?? false;
  const isTyping = typingUsers.length > 0;
  const headerAvatarUrl = !isGroup && !isService ? activeChat?.avatarUrl : undefined;

  const activeGroupCall = chatId ? (activeCallByChat[chatId] ?? null) : null;
  const showCallBanner = isGroup && !!activeGroupCall && activeGroupCall.id !== myCallId;

  let subtitle: string | null = null;
  let subtitleTone: 'default' | 'online' | 'accent' = 'default';
  if (isService) {
    subtitle = null;
  } else if (isTyping) {
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
    selectedMessages.length === 1 &&
    selectedMessages[0]!.sender?.id === myId &&
    !selectedMessages[0]!.deletedAt &&
    isEditableMessage(selectedMessages[0]!);

  const myRole = members?.find((m) => m.userId === myId)?.role;
  const isGroupAdmin = isGroup && (myRole === 'OWNER' || myRole === 'ADMIN');
  const canDeleteSelection = isDeletableSelection(selectedMessages, myId, isGroupAdmin);

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
    if (selectedIds.size === 0) return;
    setSelectionDeleteConfirm(true);
  }

  function handleConfirmSelectionDelete(): void {
    setSelectionDeleteConfirm(false);
    if (!chatId || selectedIds.size === 0) return;
    deleteMessagesBatch(chatId, [...selectedIds]).catch(() => {});
  }

  function handleSelectionReply(): void {
    const message = selectedMessages[0];
    if (!message) return;
    setComposerContext({ mode: 'reply', message });
    exitSelection();
  }

  const muteItem: MenuItem = {
    id: 'mute',
    label: muted ? 'Включить уведомления' : 'Отключить уведомления',
    icon: muted ? 'mute' : 'bell',
    muted,
    onSelect: () => {
      if (chatId) setChatMuted(chatId, !muted).catch(() => undefined);
    },
  };

  const profileItem: MenuItem = {
    id: 'profile',
    label: 'Профиль',
    icon: 'user-circle',
    onSelect: () => {
      if (isGroup) setGroupPanelOpen(true);
      else navigate(`/chats/${chatId}/info`);
    },
  };

  const editItem: MenuItem = { id: 'edit', label: 'Изменить', icon: 'edit', onSelect: () => {} };
  const blockItem: MenuItem = { id: 'block', label: 'Заблокировать', icon: 'lock', onSelect: () => {} };
  const deleteItem: MenuItem = {
    id: 'delete',
    label: 'Удалить чат',
    icon: 'trash',
    danger: true,
    onSelect: () => setDeleteModalOpen(true),
  };

  const headerMenuItems: MenuItem[] = isService
    ? [muteItem]
    : isGroup
      ? isDesktop
        ? [editItem, muteItem, blockItem]
        : [profileItem, muteItem]
      : isDesktop
        ? [editItem, muteItem, blockItem, deleteItem]
        : [profileItem, muteItem, deleteItem];

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
        ['--composer-inset-bottom' as string]:
          emojiPanelOpen && !isDesktop
            ? 'calc(var(--emoji-panel-h) + var(--safe-bottom) + var(--chrome-gap))'
            : 'calc(20px + var(--safe-bottom))',
        ['--call-banner-h' as string]: showCallBanner
          ? isDesktop
            ? `${CALL_BANNER_H}px`
            : `calc(${CALL_BANNER_H}px + var(--chrome-gap))`
          : '0px',
        // На десктопе баннеры — сплошные полосы встык, без --chrome-gap между ними и шапкой
        // (ChatScreen.module.css → .pinnedSlot/.callBannerSlot). Высота самого баннера —
        // токен --pinned-banner-h, его же ставит себе .banner в PinnedBanner.module.css.
        ['--pinned-h' as string]: `calc(${pinnedMessage ? 'var(--pinned-banner-h)' : '0px'} + var(--call-banner-h))`,
      }}
    >
      <ChatWallpaper />

      <div className={styles.headerFade} />

      <MessageList
        chatId={chatId}
        isGroup={isGroup}
        typing={isTyping}
        emojiPanelOpen={emojiPanelOpen}
        onReply={handleReply}
        onEdit={handleEdit}
        onForwardRequest={setForwardRequest}
        pinnedSlot={pinnedSlot}
      />

      {showCallBanner && activeGroupCall && (
        <div className={styles.callBannerSlot}>
          <GroupCallBanner call={activeGroupCall} onJoin={() => void joinCall(activeGroupCall.id)} />
        </div>
      )}

      {/* Крепится поверх .headerFade (z-index 4, между блюром и самой шапкой) — баннер
          читается чётко, а не сквозь размытие подложки. Содержимое порталит MessageList. */}
      <div className={styles.pinnedSlot} ref={setPinnedSlot} />

      <ChromeBar variant={isDesktop ? 'solid' : 'chrome'} style={isDesktop ? DESKTOP_HEADER_STYLE : HEADER_STYLE}>
        {selectionMode ? (
          <SelectionHeader
            count={selectedIds.size}
            canEdit={canEditSelection}
            canDelete={canDeleteSelection}
            onClose={exitSelection}
            onEdit={handleSelectionEdit}
            onCopy={handleSelectionCopy}
            onForward={() => setForwardRequest([...selectedIds])}
            onDelete={handleSelectionDelete}
          />
        ) : (
          <>
            {/* На десктопе список чатов виден слева всегда — кнопке «назад» там не место
                (ux-ui/14-desktop/03, «Ответы из макета»). */}
            {!isDesktop && <GlassButton icon="back" label="Назад к чатам" onClick={() => navigate('/chats')} />}
            <GlassPill
              variant={isDesktop ? 'flat' : 'cap'}
              title={
                isService || isSupportChat ? (
                  <span className={styles.serviceTitle}>
                    {activeChat?.title ?? '…'}
                    <OfficialMark size={16} />
                  </span>
                ) : (
                  (activeChat?.title ?? '…')
                )
              }
              subtitle={subtitle}
              subtitleTone={subtitleTone}
              leading={
                <Avatar
                  label={activeChat?.title ?? '?'}
                  avatarUrl={activeChat?.avatarUrl}
                  imageSrc={isService ? SERVICE_AVATAR_SRC : undefined}
                  size={40}
                  online={isDesktop ? subtitleTone === 'online' : undefined}
                  color={activeChat?.otherMember?.avatarColor}
                  colorKey={chatId}
                  className={isDesktop ? styles.headerAvatar : undefined}
                />
              }
              onClick={
                isService ? undefined : () => (isGroup ? setGroupPanelOpen(true) : navigate(`/chats/${chatId}/info`))
              }
              onLeadingClick={
                headerAvatarUrl ? () => openAvatarViewer(headerAvatarUrl, activeChat?.title ?? '') : undefined
              }
              leadingLabel="Открыть фото профиля"
            />
            {/* Поиск по чату — задел на будущее (ux-ui/14-desktop/03): функции поиска
                внутри переписки в продукте пока нет. */}
            {isDesktop && <GlassButton variant="plain" icon="search" label="Поиск в чате" onClick={() => {}} />}
            {/* Сервисному аккаунту не позвонишь: на той стороне никого нет. */}
            {!isService && (
              <GlassButton
                variant={isDesktop ? 'plain' : 'default'}
                icon="phone"
                label="Позвонить"
                onClick={() => void startCall(chatId, 'AUDIO')}
              />
            )}
            <GlassButton
              variant={isDesktop ? 'plain' : 'default'}
              icon="more"
              label="Ещё"
              onClick={(event) => setHeaderMenuAnchor(event.currentTarget.getBoundingClientRect())}
            />
          </>
        )}
      </ChromeBar>

      {headerMenuAnchor && (
        <Menu anchor={headerMenuAnchor} onClose={() => setHeaderMenuAnchor(null)} items={headerMenuItems} desktopWidth={246} />
      )}

      {deleteModalOpen && activeChat && <DeleteChatModal chat={activeChat} onClose={() => setDeleteModalOpen(false)} />}

      {selectionDeleteConfirm && (
        <DeleteMessageModal
          count={selectedIds.size}
          onCancel={() => setSelectionDeleteConfirm(false)}
          onConfirm={handleConfirmSelectionDelete}
        />
      )}

      <div className={styles.composerFade} />

      <ChromeBar side="bottom" style={isDesktop ? DESKTOP_COMPOSER_STYLE : COMPOSER_STYLE}>
        <div ref={composerRef} className={styles.composerSlot}>
          {selectionMode ? (
            <SelectionBar
              canReply={selectedIds.size === 1}
              onReply={handleSelectionReply}
              onForward={() => setForwardRequest([...selectedIds])}
            />
          ) : isService ? (
            <ServiceChatBar chatId={chatId} muted={muted} />
          ) : (
            <MessageComposer
              chatId={chatId}
              context={composerContext}
              onClearContext={() => setComposerContext(null)}
              onEmojiPanelToggle={setEmojiPanelOpen}
              onEditLast={isDesktop ? handleEditLast : undefined}
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
