import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { useChatStore } from '../../stores/chatStore';
import { dragSelect } from './messageSelection';
import type { SelectionDragStart } from './selectionDrag';

const DRAG_SLOP_PX = 8;
const EDGE_ZONE_PX = 56;
const EDGE_STEP_PX = 12;

export interface DragRow {
  groupIds: readonly number[];
  selectable: boolean;
}

interface DragState {
  pointerId: number;
  anchor: number;
  base: ReadonlySet<number>;
  adding: boolean;
  startY: number;
  active: boolean;
  y: number;
  frame: number;
}

interface SelectionDragSource {
  rowAt: (index: number) => DragRow | undefined;
  indexOfMessage: (messageId: number) => number;
  edges: () => { top: number; bottom: number };
}

function rowIndexAt(list: HTMLElement, y: number): number | undefined {
  for (const node of list.querySelectorAll<HTMLElement>('[data-row-index]')) {
    const rect = node.getBoundingClientRect();
    if (y >= rect.top && y < rect.bottom) return Number(node.dataset.rowIndex);
  }
  return undefined;
}

export function useSelectionDrag(
  listRef: RefObject<HTMLDivElement | null>,
  source: SelectionDragSource,
): (start: SelectionDragStart) => void {
  const dragRef = useRef<DragState | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const applyRange = useCallback(() => {
    const drag = dragRef.current;
    const list = listRef.current;
    if (!drag?.active || !list) return;
    const { rowAt, edges } = sourceRef.current;
    const { top, bottom } = edges();
    const target = rowIndexAt(list, Math.min(Math.max(drag.y, top + 1), bottom - 1));
    if (target === undefined) return;
    const step = target >= drag.anchor ? 1 : -1;
    const groups: (readonly number[])[] = [];
    for (let index = drag.anchor; ; index += step) {
      const row = rowAt(index);
      if (row?.selectable) groups.push(row.groupIds);
      if (index === target) break;
    }
    useChatStore.getState().setSelected(dragSelect(drag.base, groups, drag.adding));
  }, [listRef]);

  const autoScroll = useCallback(() => {
    const drag = dragRef.current;
    const list = listRef.current;
    if (!drag || !list) return;
    drag.frame = 0;
    if (!drag.active) return;
    const { top, bottom } = sourceRef.current.edges();
    const speed = drag.y < top + EDGE_ZONE_PX ? -EDGE_STEP_PX : drag.y > bottom - EDGE_ZONE_PX ? EDGE_STEP_PX : 0;
    if (speed === 0) return;
    const before = list.scrollTop;
    list.scrollTop += speed;
    if (list.scrollTop !== before) applyRange();
    drag.frame = requestAnimationFrame(autoScroll);
  }, [listRef, applyRange]);

  const stop = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.frame) cancelAnimationFrame(drag.frame);
    dragRef.current = null;
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    function handleMove(event: PointerEvent): void {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.y = event.clientY;
      if (!drag.active && Math.abs(event.clientY - drag.startY) <= DRAG_SLOP_PX) return;
      drag.active = true;
      applyRange();
      if (drag.frame === 0) drag.frame = requestAnimationFrame(autoScroll);
    }

    function handleEnd(event: PointerEvent): void {
      if (dragRef.current?.pointerId === event.pointerId) stop();
    }

    function handleTouchMove(event: TouchEvent): void {
      if (dragRef.current && event.cancelable) event.preventDefault();
    }

    list.addEventListener('pointermove', handleMove, true);
    list.addEventListener('pointerup', handleEnd, true);
    list.addEventListener('pointercancel', handleEnd, true);
    list.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
    return () => {
      list.removeEventListener('pointermove', handleMove, true);
      list.removeEventListener('pointerup', handleEnd, true);
      list.removeEventListener('pointercancel', handleEnd, true);
      list.removeEventListener('touchmove', handleTouchMove, true);
      stop();
    };
  }, [listRef, applyRange, autoScroll, stop]);

  return useCallback(
    (start: SelectionDragStart) => {
      stop();
      const anchor = sourceRef.current.indexOfMessage(start.messageId);
      if (anchor < 0) return;
      dragRef.current = {
        pointerId: start.pointerId,
        anchor,
        base: new Set(useChatStore.getState().selectedIds),
        adding: start.adding,
        startY: start.y,
        active: false,
        y: start.y,
        frame: 0,
      };
    },
    [stop],
  );
}
