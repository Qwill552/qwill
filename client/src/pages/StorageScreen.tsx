import type { ChatListItemDto } from '@messenger/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AmbientBlobs } from '../app/AmbientBlobs';
import card from '../app/desktopCard.module.css';
import { useLayoutMode } from '../app/useLayoutMode';
import { isStoragePersisted, readRetentionSettings, writeRetentionSetting, type MediaKind, type RetentionPeriod } from '../cache/db';
import {
  areAllSelected,
  chatCellKeys,
  chatKindCellKey,
  clearAllHistory,
  clearAllMedia,
  clearSelectedMedia,
  computeStorageUsage,
  countCachedMessages,
  kindCellKeys,
  MEDIA_KINDS,
  selectionTotalBytes,
  type ChatStorageEntry,
  type StorageUsage,
} from '../cache/storageUsage';
import { isServiceChat } from '../features/chat/serviceChat';
import { isEmptyPrivateChat } from '../features/chats/visibleChats';
import { Modal } from '../features/groups/Modal';
import { formatBytes } from '../features/messages/Attachment';
import { useChatStore } from '../stores/chatStore';
import { Avatar } from '../ui/Avatar';
import { Card } from '../ui/Card';
import { ChromeBar } from '../ui/chrome/ChromeBar';
import { GlassButton } from '../ui/chrome/GlassButton';
import { GlassPill } from '../ui/chrome/GlassPill';
import { Icon, type IconName } from '../ui/Icon';
import type { TileTint } from '../ui/IconTile';
import { ScrollIndicator } from '../ui/ScrollIndicator';
import { SegmentedControl, type Segment } from '../ui/SegmentedControl';
import { Sheet } from '../ui/Sheet';
import { Skeleton } from '../ui/Skeleton';
import styles from './StorageScreen.module.css';

const KIND_LABEL: Record<MediaKind, string> = {
  photo: 'Фото',
  video: 'Видео',
  file: 'Файлы',
  voice: 'Голосовые',
  audio: 'Аудио',
  avatar: 'Аватары',
  other: 'Прочее',
};

const KIND_ICON: Record<MediaKind, IconName> = {
  photo: 'image',
  video: 'video',
  file: 'file',
  voice: 'mic',
  audio: 'headphones',
  avatar: 'user',
  other: 'more',
};

const KIND_TINT: Record<MediaKind, TileTint> = {
  photo: 'blue',
  video: 'violet',
  file: 'orange',
  voice: 'green',
  audio: 'pink',
  avatar: 'indigo',
  other: 'teal',
};

const RETENTION_SEGMENTS: Segment<RetentionPeriod>[] = [
  { value: '3d', label: '3 дня' },
  { value: '1w', label: 'Неделя' },
  { value: '1m', label: 'Месяц' },
  { value: 'forever', label: 'Всегда' },
];

interface StorageEstimate {
  usage: number;
  quota: number;
}

function RowCheckbox({ checked }: { checked: boolean }) {
  return (
    <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`} aria-hidden="true">
      {checked && <Icon name="check" size={14} />}
    </span>
  );
}

interface ChatStorageRowProps {
  entry: ChatStorageEntry;
  chat: ChatListItemDto | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
  selection: ReadonlySet<string>;
  onToggleKeys: (keys: string[]) => void;
}

function ChatStorageRow({ entry, chat, expanded, onToggleExpand, selection, onToggleKeys }: ChatStorageRowProps) {
  const keys = chatCellKeys(entry);
  const checked = areAllSelected(keys, selection);
  const kinds = Object.keys(entry.byKind) as MediaKind[];

  return (
    <>
      <div className={styles.chatRow}>
        <button
          type="button"
          className={styles.chatRowMain}
          aria-expanded={expanded}
          onClick={onToggleExpand}
        >
          <Avatar
            label={chat?.title ?? '?'}
            avatarUrl={chat?.avatarUrl ?? null}
            size={44}
            color={chat?.otherMember?.avatarColor}
            colorKey={entry.chatId}
          />
          <span className={styles.chatRowBody}>
            <span className={styles.chatRowTitle}>{chat?.title ?? 'Удалённый чат'}</span>
            <span className={styles.chatRowSize}>{formatBytes(entry.size)}</span>
          </span>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} className={styles.chatRowChevron} />
        </button>
        <button
          type="button"
          className={styles.chatRowCheckboxButton}
          aria-pressed={checked}
          aria-label={checked ? `Снять выбор чата «${chat?.title ?? 'чат'}»` : `Выбрать чат «${chat?.title ?? 'чат'}»`}
          onClick={() => onToggleKeys(keys)}
        >
          <RowCheckbox checked={checked} />
        </button>
      </div>
      {expanded &&
        kinds.map((kind) => {
          const key = chatKindCellKey(entry.chatId, kind);
          return (
            <Card.Row
              key={kind}
              className={styles.subRow}
              icon={KIND_ICON[kind]}
              tint={KIND_TINT[kind]}
              title={KIND_LABEL[kind]}
              value={formatBytes(entry.byKind[kind]!)}
              trailing={<RowCheckbox checked={selection.has(key)} />}
              chevron={false}
              onClick={() => onToggleKeys([key])}
            />
          );
        })}
    </>
  );
}

export function StorageScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const scrollerRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const chats = useChatStore((s) => s.chats);
  const loadChats = useChatStore((s) => s.loadChats);

  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'media' | 'history' | null>(null);
  const [busy, setBusy] = useState(false);
  const [exceptionPickerOpen, setExceptionPickerOpen] = useState(false);

  const [keepMediaPrivate, setKeepMediaPrivate] = useState<RetentionPeriod>('1w');
  const [keepMediaGroups, setKeepMediaGroups] = useState<RetentionPeriod>('1w');
  const [keepMediaExceptions, setKeepMediaExceptions] = useState<Record<string, RetentionPeriod>>({});

  async function refresh(): Promise<void> {
    const [nextUsage, nextCount] = await Promise.all([computeStorageUsage(), countCachedMessages()]);
    setUsage(nextUsage);
    setMessageCount(nextCount);
    setSelection(new Set());
  }

  useEffect(() => {
    void refresh();
    setPersisted(isStoragePersisted());

    void readRetentionSettings().then((settings) => {
      setKeepMediaPrivate(settings.keepMediaPrivate);
      setKeepMediaGroups(settings.keepMediaGroups);
      setKeepMediaExceptions(settings.keepMediaExceptions);
    });

    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      void navigator.storage.estimate().then((result) => {
        if (result.usage != null && result.quota != null) setEstimate({ usage: result.usage, quota: result.quota });
      });
    }
  }, []);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  const chatById = useMemo(() => new Map(chats.map((chat) => [chat.id, chat])), [chats]);

  function toggleKeys(keys: string[]): void {
    if (keys.length === 0) return;
    setSelection((prev) => {
      const next = new Set(prev);
      const allSelected = areAllSelected(keys, prev);
      for (const key of keys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  async function handleFreeSelected(): Promise<void> {
    if (selection.size === 0 || busy) return;
    setBusy(true);
    try {
      await clearSelectedMedia(selection);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmedClear(): Promise<void> {
    const action = confirmAction;
    if (!action || busy) return;
    setBusy(true);
    try {
      if (action === 'media') await clearAllMedia();
      else await clearAllHistory();
      await refresh();
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  function setExceptionPeriod(chatId: string, period: RetentionPeriod): void {
    const next = { ...keepMediaExceptions, [chatId]: period };
    setKeepMediaExceptions(next);
    void writeRetentionSetting('keepMediaExceptions', next);
  }

  function removeException(chatId: string): void {
    const next = { ...keepMediaExceptions };
    delete next[chatId];
    setKeepMediaExceptions(next);
    void writeRetentionSetting('keepMediaExceptions', next);
  }

  function addException(chatId: string): void {
    setExceptionPickerOpen(false);
    setExceptionPeriod(chatId, keepMediaPrivate);
  }

  const selectedBytes = usage ? selectionTotalBytes(usage, selection) : 0;
  const exceptionChatIds = Object.keys(keepMediaExceptions);
  const pickableChats = chats.filter(
    (chat) => !isServiceChat(chat) && !isEmptyPrivateChat(chat) && !exceptionChatIds.includes(chat.id),
  );

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div ref={scrollerRef} className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}>
        <ScrollIndicator target={scrollerRef} mode="bounded" boundsTop={summaryRef} boundsBottom={summaryRef} />

        <div ref={summaryRef}>
          <Card caption="Занято на устройстве">
            {usage === null ? (
              <div className={styles.summarySkeleton}>
                <Skeleton width="40%" height={28} />
                <Skeleton width="70%" height={14} />
              </div>
            ) : (
              <div className={styles.summary}>
                <span className={styles.summaryTotal}>{formatBytes(usage.total)}</span>
                {estimate && <span className={styles.summarySub}>из {formatBytes(estimate.quota)}, доступных приложению</span>}
                <span className={styles.summarySub}>
                  {messageCount === null ? '…' : `Сообщений в кэше: ${messageCount}`}
                </span>
                {persisted !== null && (
                  <span className={styles.summarySub}>
                    {persisted ? 'Данные защищены от автоочистки системой' : 'Система может освободить место при нехватке диска'}
                  </span>
                )}
              </div>
            )}
          </Card>
        </div>

        <Card caption="По типам">
          {usage === null
            ? Array.from({ length: 4 }, (_, index) => (
                <div key={index} className={styles.rowSkeleton}>
                  <Skeleton width={36} height={36} circle />
                  <Skeleton width="50%" height={14} />
                </div>
              ))
            : MEDIA_KINDS.map((kind) => {
                const size = usage.byKind[kind];
                if (size === 0) return null;
                const keys = kindCellKeys(usage, kind);
                return (
                  <Card.Row
                    key={kind}
                    icon={KIND_ICON[kind]}
                    tint={KIND_TINT[kind]}
                    title={KIND_LABEL[kind]}
                    value={formatBytes(size)}
                    trailing={<RowCheckbox checked={areAllSelected(keys, selection)} />}
                    chevron={false}
                    onClick={() => toggleKeys(keys)}
                  />
                );
              })}
          {usage !== null && usage.total === 0 && <Card.Row title="Кэш пуст" chevron={false} />}
        </Card>

        {usage !== null && usage.byChat.length > 0 && (
          <Card caption="По чатам">
            {usage.byChat.map((entry) => (
              <ChatStorageRow
                key={entry.chatId}
                entry={entry}
                chat={chatById.get(entry.chatId)}
                expanded={expandedChatId === entry.chatId}
                onToggleExpand={() => setExpandedChatId((current) => (current === entry.chatId ? null : entry.chatId))}
                selection={selection}
                onToggleKeys={toggleKeys}
              />
            ))}
          </Card>
        )}

        <Card>
          <Card.Row
            title={selection.size === 0 ? 'Выберите, что освободить' : `Освободить ${formatBytes(selectedBytes)}`}
            chevron={false}
            className={selection.size === 0 ? styles.disabledRow : styles.freeRow}
            onClick={selection.size === 0 ? undefined : () => void handleFreeSelected()}
          />
        </Card>

        <Card caption="Хранить медиа в личных чатах">
          <div className={styles.control}>
            <SegmentedControl
              label="Хранить медиа в личных чатах"
              segments={RETENTION_SEGMENTS}
              value={keepMediaPrivate}
              onChange={(value) => {
                setKeepMediaPrivate(value);
                void writeRetentionSetting('keepMediaPrivate', value);
              }}
            />
          </div>
        </Card>

        <Card caption="Хранить медиа в группах">
          <div className={styles.control}>
            <SegmentedControl
              label="Хранить медиа в группах"
              segments={RETENTION_SEGMENTS}
              value={keepMediaGroups}
              onChange={(value) => {
                setKeepMediaGroups(value);
                void writeRetentionSetting('keepMediaGroups', value);
              }}
            />
          </div>
        </Card>

        <Card caption="Исключения">
          {exceptionChatIds.map((chatId) => {
            const chat = chatById.get(chatId);
            return (
              <div key={chatId} className={styles.exception}>
                <Card.Row
                  title={chat?.title ?? 'Чат'}
                  leading={
                    <Avatar
                      label={chat?.title ?? '?'}
                      avatarUrl={chat?.avatarUrl ?? null}
                      size={44}
                      color={chat?.otherMember?.avatarColor}
                      colorKey={chatId}
                    />
                  }
                  trailing={
                    <button
                      type="button"
                      className={styles.removeException}
                      aria-label={`Убрать исключение для «${chat?.title ?? 'чата'}»`}
                      onClick={() => removeException(chatId)}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  }
                  chevron={false}
                />
                <div className={styles.control}>
                  <SegmentedControl
                    label={`Хранить медиа: ${chat?.title ?? chatId}`}
                    segments={RETENTION_SEGMENTS}
                    value={keepMediaExceptions[chatId]!}
                    onChange={(value) => setExceptionPeriod(chatId, value)}
                  />
                </div>
              </div>
            );
          })}
          <Card.Row icon="plus" tint="blue" title="Добавить исключение" onClick={() => setExceptionPickerOpen(true)} />
        </Card>

        <Card>
          <Card.Row
            icon="database"
            tint="red"
            title="Очистить медиа"
            subtitle="Локальные копии, сервер не тронется"
            danger
            onClick={() => setConfirmAction('media')}
          />
          <Card.Row
            icon="history"
            tint="red"
            title="Очистить историю"
            subtitle="Локальная копия, сервер не тронется"
            danger
            onClick={() => setConfirmAction('history')}
          />
        </Card>
      </div>

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в настройки" onClick={() => navigate('/settings')} />
          <GlassPill title="Данные и память" />
        </ChromeBar>
      )}

      {confirmAction && (
        <Modal title={confirmAction === 'media' ? 'Очистить медиа?' : 'Очистить историю?'} onClose={() => setConfirmAction(null)} opaque>
          <p className={styles.confirmText}>
            {confirmAction === 'media'
              ? 'Локальные копии фото, видео, файлов и голосовых будут удалены. Переписка на сервере останется, неотправленное из очереди не тронется — медиа загрузится заново при следующем открытии.'
              : 'Локальная копия переписки будет удалена. На сервере сообщения останутся и подгрузятся заново при открытии чата. Неотправленное из очереди не тронется.'}
          </p>
          <div className={styles.confirmActions}>
            <button className={styles.stayButton} type="button" onClick={() => setConfirmAction(null)} disabled={busy}>
              Отмена
            </button>
            <button className={styles.discardButton} type="button" onClick={() => void handleConfirmedClear()} disabled={busy}>
              Очистить
            </button>
          </div>
        </Modal>
      )}

      {exceptionPickerOpen && (
        <Sheet
          title="Добавить исключение"
          subtitle="Свой срок хранения медиа для этого чата"
          onClose={() => setExceptionPickerOpen(false)}
        >
          <Card>
            {pickableChats.map((chat) => (
              <Card.Row
                key={chat.id}
                title={chat.title}
                leading={
                  <Avatar label={chat.title} avatarUrl={chat.avatarUrl} size={44} color={chat.otherMember?.avatarColor} colorKey={chat.id} />
                }
                chevron={false}
                onClick={() => addException(chat.id)}
              />
            ))}
            {pickableChats.length === 0 && <Card.Row title="Нет доступных чатов" chevron={false} />}
          </Card>
        </Sheet>
      )}
    </div>
  );
}
