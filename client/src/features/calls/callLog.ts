import type { MessageCallDto } from '@messenger/shared';

import type { IconName } from '../../ui/Icon';

export function isUnansweredCall(call: MessageCallDto): boolean {
  return call.startedAt === null;
}

export function callStatusLabel(call: MessageCallDto, own: boolean): string {
  if (call.status === 'DECLINED') return own ? 'Звонок отклонён' : 'Отклонённый звонок';
  if (isUnansweredCall(call)) {
    if (!own) return 'Пропущенный звонок';
    return call.status === 'MISSED' ? 'Звонок без ответа' : 'Отменённый звонок';
  }
  return own ? 'Исходящий звонок' : 'Входящий звонок';
}

export function callSymbolIcon(call: MessageCallDto, own: boolean): IconName {
  if (call.status === 'DECLINED') return 'close';
  return own ? 'call-out' : 'call-in';
}

export function formatCallDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${tail}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function callDurationText(call: MessageCallDto): string | null {
  if (!call.startedAt || !call.endedAt) return null;
  return formatCallDuration(new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime());
}

export function callPreviewText(call: MessageCallDto, own: boolean): string {
  const duration = callDurationText(call);
  const label = callStatusLabel(call, own);
  return duration ? `${label} · ${duration}` : label;
}
