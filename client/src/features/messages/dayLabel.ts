function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysBetween(now: Date, date: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = daysBetween(now, date);

  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  if (diff >= 2 && diff < 7) return capitalize(date.toLocaleDateString('ru-RU', { weekday: 'long' }));
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatAttachmentDateTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (daysBetween(now, date) === 0) return `сегодня в ${time}`;
  const day =
    date.getFullYear() === now.getFullYear()
      ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${day} в ${time}`;
}

export function formatChatRowWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = daysBetween(now, date);

  if (diff === 0) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'вчера';
  if (diff >= 2 && diff < 7) return date.toLocaleDateString('ru-RU', { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
