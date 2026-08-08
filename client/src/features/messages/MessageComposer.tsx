import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { EmojiPanel } from '../emoji/EmojiPanel';
import { VoiceRecorder, type VoiceRecorderHandle } from '../voice/VoiceRecorder';
import { AttachSheet } from './AttachSheet';
import { ComposerContextBar, type ComposerContextValue } from './ComposerContext';
import { MediaPickerSheet } from './MediaPickerSheet';
import styles from './MessageComposer.module.css';

const TYPING_STOP_DELAY_MS = 3000;
const INPUT_MAX_HEIGHT_PX = 120;
const SUPPORTS_ENTER_TO_SEND = !window.matchMedia('(pointer: coarse)').matches;

export type ComposerContext = ComposerContextValue;

export function MessageComposer({
  chatId,
  context,
  onClearContext,
  onEmojiPanelToggle,
}: {
  chatId: string;
  context: ComposerContext | null;
  onClearContext: () => void;
  onEmojiPanelToggle?: (open: boolean) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emojiPanelOpen, setEmojiPanelOpenState] = useState(false);
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

  const isTypingRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRangeRef = useRef({ start: 0, end: 0 });
  const lastEnterHandledAtRef = useRef(0);
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
    if (context?.mode === 'edit') setValue(context.message.content ?? '');
    if (context) textareaRef.current?.focus();
  }, [context]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const capped = textarea.scrollHeight > INPUT_MAX_HEIGHT_PX;
    textarea.style.height = `${Math.min(textarea.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
    textarea.style.overflowY = capped ? 'auto' : 'hidden';
  }, [value]);

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

  function handleTextareaChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    handleChange(event.target.value);
  }

  function handleFieldBlur(): void {
    const textarea = textareaRef.current;
    if (textarea) caretRangeRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
  }

  function insertTextAtCaret(text: string): void {
    const start = Math.min(caretRangeRef.current.start, value.length);
    const end = Math.min(Math.max(caretRangeRef.current.end, start), value.length);
    const next = value.slice(0, start) + text + value.slice(end);
    const caret = start + text.length;
    caretRangeRef.current = { start: caret, end: caret };
    handleChange(next);

    const textarea = textareaRef.current;
    if (textarea && document.activeElement === textarea) {
      requestAnimationFrame(() => textarea.setSelectionRange(caret, caret));
    }
  }

  function insertEmoji(emoji: string): void {
    insertTextAtCaret(emoji);
  }

  function handleCancelContext(): void {
    if (context?.mode === 'edit') setValue('');
    setError(null);
    onClearContext();
  }

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

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Escape' && context) {
      event.preventDefault();
      handleCancelContext();
      return;
    }
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (!SUPPORTS_ENTER_TO_SEND || event.shiftKey) return;
    if (event.timeStamp - lastEnterHandledAtRef.current < 100) {
      event.preventDefault();
      return;
    }
    lastEnterHandledAtRef.current = event.timeStamp;
    event.preventDefault();
    void submit();
  }

  function handleFilesFromSheet(files: File[]): void {
    setAttachSheetOpen(false);
    setPickedFiles(files);
  }

  function handleMediaSend(caption: string): void {
    if (!user || !pickedFiles) return;
    const replyTo = context?.mode === 'reply' ? context.message : undefined;
    pickedFiles.forEach((file, index) => {
      sendAttachmentMessage(chatId, user, file, {
        caption: index === 0 ? caption || undefined : undefined,
        replyTo: index === 0 ? replyTo : undefined,
      });
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
    sendAttachmentMessage(chatId, user, file, { duration: durationMs, peaks, replyTo });
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

      <form className={styles.composer} onSubmit={handleSubmit}>
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
              onClick={() => setEmojiPanelOpen(!emojiPanelOpen)}
              aria-label="Эмодзи"
              title="Эмодзи"
              aria-pressed={emojiPanelOpen}
            >
              <Icon name="emoji" size={22} />
            </button>
            <textarea
              ref={textareaRef}
              className={styles.input}
              value={value}
              onChange={handleTextareaChange}
              onBlur={handleFieldBlur}
              onKeyDown={handleKeyDown}
              placeholder={editing ? 'Изменить сообщение' : 'Сообщение'}
              rows={1}
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

      {emojiPanelOpen && <EmojiPanel onSelect={insertEmoji} onClose={() => setEmojiPanelOpen(false)} />}

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
