import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useEscapeKey } from '../../app/hotkeys';
import {
  chooseDesktopScreenSource,
  subscribeToScreenSourceRequests,
  type DesktopScreenSource,
  type DesktopScreenSourceRequest,
} from '../../native/desktop';
import { SegmentedControl, type Segment } from '../../ui/SegmentedControl';
import styles from './ScreenSourcePicker.module.css';

type SourceKind = DesktopScreenSource['kind'];

const SEGMENTS: Segment<SourceKind>[] = [
  { value: 'screen', label: 'Экран' },
  { value: 'window', label: 'Окна' },
];

const EMPTY_TEXT: Record<SourceKind, string> = {
  screen: 'Экранов не нашлось',
  window: 'Открытых окон не нашлось',
};

export function ScreenSourcePicker() {
  const [request, setRequest] = useState<DesktopScreenSourceRequest | null>(null);
  const [kind, setKind] = useState<SourceKind>('screen');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const answered = useRef<DesktopScreenSourceRequest | null>(null);

  useEffect(
    () =>
      subscribeToScreenSourceRequests((next) => {
        if (next.sources.length === 0) {
          chooseDesktopScreenSource(next.requestId, null);
          return;
        }
        const preferred = next.sources.find((source) => source.kind === 'screen') ?? next.sources[0]!;
        answered.current = next;
        setRequest(next);
        setKind(preferred.kind);
        setSelectedId(preferred.id);
      }),
    [],
  );

  function answer(sourceId: string | null): void {
    const current = answered.current;
    if (!current) return;
    answered.current = null;
    chooseDesktopScreenSource(current.requestId, sourceId);
    setRequest(null);
  }

  useEscapeKey(request !== null, () => answer(null));

  if (!request) return null;

  const shown = request.sources.filter((source) => source.kind === kind);
  const selected = shown.find((source) => source.id === selectedId) ?? null;

  return createPortal(
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-label="Что показать собеседнику">
      <div className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.title}>Что показать?</h2>
          <SegmentedControl
            segments={SEGMENTS}
            value={kind}
            onChange={(next) => {
              setKind(next);
              setSelectedId(request.sources.find((source) => source.kind === next)?.id ?? null);
            }}
            label="Тип источника"
            className={styles.tabs}
          />
        </div>

        <div className={`${styles.grid} hide-native-scrollbar`}>
          {shown.map((source) => (
            <button
              key={source.id}
              type="button"
              className={`${styles.tile} ${source.id === selectedId ? styles.tileSelected : ''}`}
              aria-pressed={source.id === selectedId}
              onClick={() => setSelectedId(source.id)}
              onDoubleClick={() => answer(source.id)}
            >
              <span className={styles.preview}>
                <img className={styles.thumbnail} src={source.thumbnail} alt="" draggable={false} />
              </span>
              <span className={styles.caption}>
                {source.appIcon && <img className={styles.appIcon} src={source.appIcon} alt="" draggable={false} />}
                <span className={styles.name}>{source.name}</span>
              </span>
            </button>
          ))}
          {shown.length === 0 && <p className={styles.empty}>{EMPTY_TEXT[kind]}</p>}
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelButton} type="button" onClick={() => answer(null)}>
            Отмена
          </button>
          <button
            className={styles.shareButton}
            type="button"
            disabled={selected === null}
            onClick={() => answer(selected?.id ?? null)}
          >
            Показать
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
