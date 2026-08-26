import { DEFAULT_MAX_FILE_SIZE_BYTES } from '@messenger/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ClipboardEvent,
  CompositionEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

import { useEscapeKey, useHotkey } from '../../app/hotkeys';
import { setPendingDraftProvider, takePendingDraft } from '../../app/pendingDraft';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { useEmojiIndex, type EmojiIndex } from '../emoji/emojiIndex';
import { EmojiPanel } from '../emoji/EmojiPanel';
import { VoiceRecorder, type VoiceRecorderHandle } from '../voice/VoiceRecorder';
import { AttachSheet } from './AttachSheet';
import { formatBytes } from './Attachment';
import { ComposerContextBar, type ComposerContextValue } from './ComposerContext';
import {
  composerDomMatchesTokens,
  createComposerEmojiElement,
  getComposerCaretOffset,
  getComposerCaretRange,
  renderComposerDom,
  serializeComposerDom,
  setComposerCaretOffset,
  tokenizeComposerValue,
} from './composerContent';
import { MediaPickerSheet } from './MediaPickerSheet';
import styles from './MessageComposer.module.css';

const TYPING_STOP_DELAY_MS = 3000;
const COMPOSER_EMOJI_SIZE = 20;

export type ComposerContext = ComposerContextValue;

export function MessageComposer({
  chatId,
  context,
  onClearContext,
  onEmojiPanelToggle,
  onEditLast,
}: {
  chatId: string;
  context: ComposerContext | null;
  onClearContext: () => void;
  onEmojiPanelToggle?: (open: boolean) => void;
  onEditLast?: () => void;
}) {
  const [value, setValue] = useState(() => takePendingDraft(chatId) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [emojiPanelOpen, setEmojiPanelOpenState] = useState(false);
  const [emojiAnchor, setEmojiAnchor] = useState<DOMRect | null>(null);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [pickedFiles, setPickedFiles] = useState<File[] | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingLocked, setRecordingLocked] = useState(false);

  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendAttachmentMessage = useChatStore((s) => s.sendAttachmentMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const startTyping = useChatStore((s) => s.startTyping);
  const stopTyping = useChatStore((s) => s.stopTyping);
  const user = useAuthStore((s) => s.user);
  const emojiIndex = useEmojiIndex();

  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    setPendingDraftProvider(() => ({ chatId, text: valueRef.current }));
    return () => setPendingDraftProvider(null);
  }, [chatId]);

  const isTypingRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fieldRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const caretRangeRef = useRef({ start: 0, end: 0 });
  const pendingCaretRef = useRef<number | null>(null);
  const renderedEmojiIndexRef = useRef<EmojiIndex | null | undefined>(undefined);
  const roundButtonRef = useRef<HTMLButtonElement>(null);
  const recorderRef = useRef<VoiceRecorderHandle>(null);
  const recordOriginRef = useRef({ x: 0, y: 0 });

  function setEmojiPanelOpen(open: boolean): void {
    setEmojiPanelOpenState(open);
    onEmojiPanelToggle?.(open);
  }

  useEffect(() => {
    return () => onEmojiPanelToggle?.(false);
  }, [onEmojiPanelToggle]);

  useEffect(() => {
    if (context?.mode === 'edit') {
      const content = context.message.content ?? '';
      pendingCaretRef.current = content.length;
      caretRangeRef.current = { start: content.length, end: content.length };
      setValue(content);
    }
    if (context) fieldRef.current?.focus();
  }, [context]);

  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el || recording || isComposingRef.current) return;

    const tokens = tokenizeComposerValue(value);
    const staleSprites = renderedEmojiIndexRef.current !== emojiIndex && tokens.some((token) => token.kind === 'emoji');
    renderedEmojiIndexRef.current = emojiIndex;

    if (!staleSprites && composerDomMatchesTokens(el, tokens)) {
      pendingCaretRef.current = null;
      return;
    }

    const focused = document.activeElement === el;
    const caret = focused ? (pendingCaretRef.current ?? getComposerCaretOffset(el)) : null;
    pendingCaretRef.current = null;

    renderComposerDom(el, tokens, (emoji) =>
      createComposerEmojiElement(emoji, emojiIndex, COMPOSER_EMOJI_SIZE, styles.inlineEmoji),
    );

    if (caret != null) setComposerCaretOffset(el, caret);
  }, [value, emojiIndex, recording]);

  useEffect(() => {
    return () => {
      clearTimeout(stopTimerRef.current);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        stopTyping(chatId);
      }
    };
  }, [chatId, stopTyping]);

  function markStopped(): void {
    clearTimeout(stopTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping(chatId);
    }
  }

  function handleChange(next: string): void {
    setValue(next);

    if (!next.trim()) {
      markStopped();
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      startTyping(chatId);
    }
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(markStopped, TYPING_STOP_DELAY_MS);
  }

  function flushFieldContent(): void {
    if (isComposingRef.current) return;
    const el = fieldRef.current;
    if (!el) return;
    const range = getComposerCaretRange(el);
    const next = serializeComposerDom(el);
    pendingCaretRef.current = range.start;
    caretRangeRef.current = range;
    handleChange(next);
  }

  function handleFieldInput(): void {
    flushFieldContent();
  }

  function handleCompositionStart(): void {
    isComposingRef.current = true;
  }

  function handleCompositionEnd(_event: CompositionEvent<HTMLDivElement>): void {
    isComposingRef.current = false;
    flushFieldContent();
  }

  function handleFieldBlur(): void {
    const el = fieldRef.current;
    if (el) caretRangeRef.current = getComposerCaretRange(el);
  }

  function insertPlainText(text: string): void {
    if (!text) return;
    const el = fieldRef.current;
    if (el) caretRangeRef.current = getComposerCaretRange(el);
    insertTextAtCaret(text);
  }

  function handleFieldPaste(event: ClipboardEvent<HTMLDivElement>): void {
    event.preventDefault();
    insertPlainText(event.clipboardData.getData('text/plain'));
  }

  function handleFieldDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    insertPlainText(event.dataTransfer.getData('text/plain'));
  }

  function insertTextAtCaret(text: string): void {
    const start = Math.min(caretRangeRef.current.start, value.length);
    const end = Math.min(Math.max(caretRangeRef.current.end, start), value.length);
    const next = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    pendingCaretRef.current = caret;
    caretRangeRef.current = { start: caret, end: caret };
    handleChange(next);
  }

  function insertEmoji(emoji: string): void {
    insertTextAtCaret(emoji);
  }

  function handleCancelContext(): void {
    if (context?.mode === 'edit') setValue('');
    setError(null);
    onClearContext();
  }

  const canEditLast = Boolean(onEditLast) && !context && !recording && value.length === 0;

  useEscapeKey(context !== null, handleCancelContext);
  useHotkey(canEditLast, { key: 'ArrowUp' }, () => onEditLast?.());

  async function submit(): Promise<void> {
    const content = value.trim();
    if (!content || !user) return;
    markStopped();

    if (context?.mode === 'edit') {
      try {
        await editMessage(chatId, context.message.id, content);
        setValue('');
        onClearContext();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось изменить сообщение');
      }
      return;
    }

    const replyTo = context?.mode === 'reply' ? context.message : undefined;
    sendMessage(chatId, content, user, undefined, replyTo);
    setValue('');
    if (replyTo) onClearContext();
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'ArrowUp' && canEditLast) {
      event.preventDefault();
      onEditLast?.();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  function handleFilesFromSheet(files: File[]): void {
    setAttachSheetOpen(false);

    const tooLarge = files.filter((file) => file.size > DEFAULT_MAX_FILE_SIZE_BYTES);
    const allowed = files.filter((file) => file.size <= DEFAULT_MAX_FILE_SIZE_BYTES);

    if (tooLarge.length > 0) {
      const limit = formatBytes(DEFAULT_MAX_FILE_SIZE_BYTES);
      setError(
        tooLarge.length === 1
          ? `«${tooLarge[0]!.name}» весит ${formatBytes(tooLarge[0]!.size)} — больше ${limit}, отправить нельзя`
          : `${tooLarge.length} файла(ов) больше ${limit} — отправить нельзя`,
      );
    } else {
      setError(null);
    }

    if (allowed.length > 0) setPickedFiles(allowed);
  }

  function handleMediaSend(caption: string): void {
    if (!user || !pickedFiles) return;
    const replyTo = context?.mode === 'reply' ? context.message : undefined;
    const albumId = pickedFiles.length > 1 ? crypto.randomUUID() : undefined;
    pickedFiles.forEach((file, index) => {
      sendAttachmentMessage(chatId, user, file, {
        caption: index === 0 ? caption || undefined : undefined,
        replyTo: index === 0 ? replyTo : undefined,
        albumId,
      }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Не удалось отправить файл'));
    });
    setPickedFiles(null);
    if (replyTo) onClearContext();
  }

  const editing = context?.mode === 'edit';
  const hasText = value.trim().length > 0;

  function handleRoundPointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (hasText || editing || recording || !user) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    recordOriginRef.current = { x: event.clientX, y: event.clientY };
    setRecording(true);
  }

  function handleRoundPointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    recorderRef.current?.onPointerMove(event);
  }

  function handleRoundPointerUp(): void {
    recorderRef.current?.onPointerUp();
  }

  function handleRoundPointerCancel(): void {
    recorderRef.current?.onPointerCancel();
  }

  function handleVoiceSend(file: File, durationMs: number, peaks: number[]): void {
    setRecording(false);
    setRecordingLocked(false);
    if (!user) return;
    const replyTo = context?.mode === 'reply' ? context.message : undefined;
    sendAttachmentMessage(chatId, user, file, { duration: durationMs, peaks, replyTo }).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Не удалось отправить голосовое'),
    );
    if (replyTo) onClearContext();
  }

  function handleVoiceCancel(): void {
    setRecording(false);
    setRecordingLocked(false);
  }

  return (
    <div className={styles.wrap}>
      {context && <ComposerContextBar context={context} onCancel={handleCancelContext} />}
      {error && <p className={styles.error}>{error}</p>}

      <form className={styles.composer} data-no-back-swipe onSubmit={handleSubmit}>
        {recording ? (
          <VoiceRecorder
            ref={recorderRef}
            originX={recordOriginRef.current.x}
            originY={recordOriginRef.current.y}
            micButtonRef={roundButtonRef}
            onPhaseChange={(phase) => setRecordingLocked(phase === 'locked')}
            onCancel={handleVoiceCancel}
            onSend={handleVoiceSend}
          />
        ) : (
          <div className={styles.field}>
            <button
              className={styles.round}
              type="button"
              onClick={(event) => {
                setEmojiAnchor(event.currentTarget.getBoundingClientRect());
                setEmojiPanelOpen(!emojiPanelOpen);
              }}
              aria-label="Эмодзи"
              title="Эмодзи"
              aria-pressed={emojiPanelOpen}
            >
              <Icon name="emoji" size={22} />
            </button>
            <div
              ref={fieldRef}
              className={styles.input}
              contentEditable
              role="textbox"
              aria-multiline="true"
              aria-label={editing ? 'Изменить сообщение' : 'Сообщение'}
              data-placeholder={editing ? 'Изменить сообщение' : 'Сообщение'}
              data-empty={value.length === 0 ? 'true' : undefined}
              onInput={handleFieldInput}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onBlur={handleFieldBlur}
              onPaste={handleFieldPaste}
              onDrop={handleFieldDrop}
              onKeyDown={handleKeyDown}
            />
            <button
              className={styles.round}
              type="button"
              onClick={() => setAttachSheetOpen(true)}
              disabled={editing}
              aria-label="Прикрепить"
              title="Прикрепить"
            >
              <Icon name="attach" size={21} />
            </button>
          </div>
        )}

        <button
          ref={roundButtonRef}
          className={styles.send}
          type={hasText ? 'submit' : 'button'}
          disabled={editing ? !hasText : recordingLocked}
          data-recording={recording && !recordingLocked ? 'true' : undefined}
          onPointerDown={handleRoundPointerDown}
          onPointerMove={handleRoundPointerMove}
          onPointerUp={handleRoundPointerUp}
          onPointerCancel={handleRoundPointerCancel}
          aria-label={hasText ? 'Отправить' : 'Записать голосовое'}
        >
          <span className={styles.morph}>
            <Icon name="mic" size={22} className={`${styles.morphIcon} ${hasText ? styles.morphHidden : ''}`} />
            <Icon name="send" size={22} className={`${styles.morphIcon} ${hasText ? '' : styles.morphHidden}`} />
          </span>
        </button>
      </form>

      {emojiPanelOpen && (
        <EmojiPanel anchor={emojiAnchor} onSelect={insertEmoji} onClose={() => setEmojiPanelOpen(false)} />
      )}

      {attachSheetOpen && <AttachSheet onClose={() => setAttachSheetOpen(false)} onFilesSelected={handleFilesFromSheet} />}

      {pickedFiles && pickedFiles.length > 0 && (
        <MediaPickerSheet
          files={pickedFiles}
          onRemove={(index) => setPickedFiles((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))}
          onClose={() => setPickedFiles(null)}
          onSend={handleMediaSend}
        />
      )}
    </div>
  );
}
