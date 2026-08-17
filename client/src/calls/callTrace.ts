const STORAGE_KEY = 'qwill.callTrace';
const MAX_ENTRIES = 200;

interface CallTraceEntry {
  atMs: number;
  event: string;
  detail?: string;
}

const pageStartAt = Date.now();

function load(): CallTraceEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CallTraceEntry[]) : [];
  } catch {
    return [];
  }
}

let entries: CallTraceEntry[] = load();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    return;
  }
}

export function traceCall(event: string, detail?: string): void {
  entries = [...entries, { atMs: Date.now() - pageStartAt, event, detail }];
  if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES);
  persist();
}

export function getCallTrace(): CallTraceEntry[] {
  return entries;
}

export function formatCallTrace(): string {
  return entries.map((entry) => `+${entry.atMs}мс  ${entry.event}${entry.detail ? `  ${entry.detail}` : ''}`).join('\n');
}

export function clearCallTrace(): void {
  entries = [];
  persist();
}

traceCall('страница загружена');
