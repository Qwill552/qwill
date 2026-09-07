import type { AttachmentDto } from '@messenger/shared';
import { useEffect, useRef, useState } from 'react';

import { useFileSrc } from '../../api/useFileSrc';
import {
  cancelNativeFileDownload,
  downloadNativeFile,
  isFileDownloaded,
  isNativeFileDownloadAvailable,
  onFileDownloadProgress,
  openNativeFile,
} from '../../native/fileDownload';
import { downloadFile, downloadHref } from './downloadFile';
import { isRiskyFileName, isRiskyWarningMuted, muteRiskyWarning } from './riskyFile';

export type FileDownloadState = 'unknown' | 'idle' | 'downloading' | 'ready';

export interface FileDownload {
  state: FileDownloadState;
  progress: number;
  href: string | undefined;
  activate: () => void;
  cancel: () => void;
  riskyPrompt: boolean;
  confirmRisky: (mute: boolean) => void;
  cancelRisky: () => void;
}

export function useFileDownload(attachment: AttachmentDto): FileDownload {
  const src = useFileSrc(attachment.file.id, { tier: 'stream' });
  const native = isNativeFileDownloadAvailable();

  const [state, setState] = useState<FileDownloadState>(native ? 'unknown' : 'idle');
  const [progress, setProgress] = useState(0);
  const [riskyPrompt, setRiskyPrompt] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const { id: fileId, mimeType } = attachment.file;
  const fileName = attachment.originalName;

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    void isFileDownloaded(fileId, fileName).then((downloaded) => {
      if (!cancelled) setState(downloaded ? 'ready' : 'idle');
    });
    return () => {
      cancelled = true;
    };
  }, [native, fileId, fileName]);

  useEffect(() => {
    if (!native) return;
    let handle: { remove: () => void } | null = null;
    let dropped = false;

    void onFileDownloadProgress((event) => {
      if (event.fileId !== fileId || event.totalBytes <= 0) return;
      setProgress(Math.min(1, event.receivedBytes / event.totalBytes));
    }).then((listener) => {
      if (dropped) void listener.remove();
      else handle = listener;
    });

    return () => {
      dropped = true;
      void handle?.remove();
    };
  }, [native, fileId]);

  function open(): void {
    if (!src) return;

    if (!native) {
      downloadFile(src, fileName);
      return;
    }

    if (stateRef.current === 'downloading') return;

    if (stateRef.current === 'ready') {
      void openNativeFile(fileId, fileName, mimeType).then((opened) => {
        if (!opened) setState('idle');
      });
      return;
    }

    setProgress(0);
    setState('downloading');
    downloadNativeFile(fileId, fileName, downloadHref(src, fileName))
      .then(() => setState('ready'))
      .catch(() => setState('idle'));
  }

  function activate(): void {
    if (!src) return;
    if (isRiskyFileName(fileName) && !isRiskyWarningMuted()) {
      setRiskyPrompt(true);
      return;
    }
    open();
  }

  function confirmRisky(mute: boolean): void {
    if (mute) muteRiskyWarning();
    setRiskyPrompt(false);
    open();
  }

  function cancelRisky(): void {
    setRiskyPrompt(false);
  }

  function cancel(): void {
    if (!native || stateRef.current !== 'downloading') return;
    void cancelNativeFileDownload(fileId);
  }

  return { state, progress, href: src, activate, cancel, riskyPrompt, confirmRisky, cancelRisky };
}
