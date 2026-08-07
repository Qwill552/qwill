import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ClipboardEvent,
  CompositionEvent,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { Icon } from '../../ui/Icon';
import { Emoji } from '../emoji/Emoji';
import { EmojiPanel } from '../emoji/EmojiPanel';
import { VoiceRecorder, type VoiceRecorderHandle } from '../voice/VoiceRecorder';
import { AttachSheet } from './AttachSheet';
import { ComposerContextBar, type ComposerContextValue } from './ComposerContext';
import {
  getComposerCaretOffset,
  serializeComposerDom,
  setComposerCaretOffset,
  tokenizeComposerValue,
  type ComposerToken,
} from './composerContent';
import { MediaPickerSheet } from './MediaPickerSheet';
import styles from './MessageComposer.module.css';

const TYPING_STOP_DELAY_MS = 3000;

export type ComposerContext = ComposerContextValue;

function renderComposerTokens(tokens: ComposerToken[]): ReactNode[] {
  return tokens.map((token, index) => {
    if (token.kind === 'text') return token.text;
    return (
      <span key={`e-${index}`} contentEditable={false} data-emoji={token.emoji} className={styles.inlineEmoji}>
        <Emoji emoji={token.emoji} size={20} />
      </span>
    );
  });
}

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
  const fieldRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const caretOffsetRef = useRef(0);
  const pendingCaretRef = useRef<number | null>(null);
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
      caretOffsetRef.current = content.length;
      setValue(content);
    }
    if (context) fieldRef.current?.focus();
  }, [context]);

  useLayoutEffect(() => {
    if (pendingCaretRef.current == null) return;
    const el = fieldRef.current;
    if (el && document.activeElement === el) setComposerCaretOffset(el, pendingCaretRef.current);
    pendingCaretRef.current = null;
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

  function flushFieldContent(): void {
    if (isComposingRef.current) return;
    const el = fieldRef.current;
    if (!el) return;
    const offset = getComposerCaretOffset(el);
    const next = serializeComposerDom(el);
    pendingCaretRef.current = offset;
    caretOffsetRef.current = offset;
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
    if (el) caretOffsetRef.current = getComposerCaretOffset(el);
  }

  function handleFieldPaste(event: ClipboardEvent<HTMLDivElement>): void {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    const el = fieldRef.current;
    if (el) caretOffsetRef.current = getComposerCaretOffset(el);
    insertTextAtCaret(text);
  }

  function insertTextAtCaret(text: string): void {
    const at = Math.min(caretOffsetRef.current, value.length);
    const next = value.slice(0, at) + text + value.slice(at);
    pendingCaretRef.current = at + text.length;
    caretOffsetRef.current = at + text.length;
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
    if (event.key === 'Escape' && context) {
      event.preventDefault();
      handleCancelContext();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
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
            <div
              ref={fieldRef}
              className={styles.input}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={editing ? 'Изменить сообщение' : 'Сообщение'}
              data-placeholder={editing ? 'Изменить сообщение' : 'Сообщение'}
              onInput={handleFieldInput}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onBlur={handleFieldBlur}
              onPaste={handleFieldPaste}
              onKeyDown={handleKeyDown}
            >
              {renderComposerTokens(tokenizeComposerValue(value))}
            </div>
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
