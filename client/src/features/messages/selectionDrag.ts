import { createContext } from 'react';

export interface SelectionDragStart {
  messageId: number;
  pointerId: number;
  adding: boolean;
  x: number;
  y: number;
}

export const SelectionDragContext = createContext<(start: SelectionDragStart) => void>(() => undefined);
