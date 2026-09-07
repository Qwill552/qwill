export type NetworkKind = 'wifi' | 'cellular' | 'unknown';

interface ConnectionLike {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
}

const CELLULAR_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g']);

export function classifyConnection(connection: ConnectionLike | undefined): NetworkKind {
  if (!connection) return 'unknown';
  if (connection.type === 'cellular') return 'cellular';
  if (connection.type && connection.type !== 'unknown' && connection.type !== 'none') return 'wifi';
  if (connection.effectiveType) return CELLULAR_EFFECTIVE_TYPES.has(connection.effectiveType) ? 'cellular' : 'wifi';
  return 'unknown';
}

function readConnection(): ConnectionLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: ConnectionLike }).connection;
}

export function getNetworkKind(): NetworkKind {
  return classifyConnection(readConnection());
}

export function getSaveData(): boolean {
  return readConnection()?.saveData === true;
}
