import { formatDayMonthLongYear } from '../../utils/dateFormats';

export const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export const WEEKDAY_LETTERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayKeyOfIso(iso: string): string {
  return dayKeyOf(new Date(iso));
}

export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

export function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

export function monthFromIndex(index: number): string {
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function shiftMonth(month: string, delta: number): string {
  return monthFromIndex(monthIndex(month) + delta);
}

export function monthDayCount(month: string): number {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

export function monthFirstDay(month: string): string {
  return `${month}-01`;
}

export function monthLastDay(month: string): string {
  return `${month}-${pad(monthDayCount(month))}`;
}

export function monthTitle(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function monthLeadingBlanks(month: string): number {
  const weekday = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).getDay();
  return (weekday + 6) % 7;
}

export function dayKeyIn(month: string, day: number): string {
  return `${month}-${pad(day)}`;
}

export function dayTitle(dayKey: string): string {
  const date = new Date(Number(dayKey.slice(0, 4)), Number(dayKey.slice(5, 7)) - 1, Number(dayKey.slice(8, 10)));
  return formatDayMonthLongYear(date);
}
