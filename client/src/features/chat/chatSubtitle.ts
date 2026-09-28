import type { ChatMemberSummary } from '@messenger/shared';

import type { TitleKind } from '../../realtime/connectionStatus';
import { formatLastSeen } from '../../utils/presence';
import { plural } from './plural';

export type SubtitleTone = 'default' | 'online' | 'accent';

export interface Subtitle {
  text: string;
  tone: SubtitleTone;
  typing: boolean;
  dots: boolean;
}

export interface SubtitleTypist {
  userId: string;
  displayName: string;
}

export interface SubtitleInput {
  connection: TitleKind;
  service: boolean;
  group: boolean;
  members: ChatMemberSummary[] | null;
  myId: string | null;
  typists: SubtitleTypist[];
  otherMember: ChatMemberSummary | null;
  presence: (userId: string) => { online: boolean; lastSeenAt: string } | undefined;
}

export const CONNECTION_TEXT: Record<Exclude<TitleKind, 'brand'>, string> = {
  waiting: 'Ожидание сети',
  connecting: 'Соединение',
  updating: 'Обновление',
  ipBanned: 'Доступ с этого адреса закрыт',
};

const TYPING = 'печатает…';
const TYPING_MANY = 'печатают…';

function firstName(displayName: string): string {
  const trimmed = displayName.trim();
  const cut = trimmed.search(/\s/);
  return cut > 0 ? trimmed.slice(0, cut) : trimmed;
}

export function groupTyping(typists: SubtitleTypist[]): string {
  const names = typists.map((typist) => firstName(typist.displayName));
  if (names.length === 1) return `${names[0]} ${TYPING}`;
  if (names.length === 2) return `${names[0]}, ${names[1]} ${TYPING_MANY}`;
  return `${names[0]}, ${names[1]} и ещё ${names.length - 2} ${TYPING_MANY}`;
}

export function membersText(count: number): string {
  return `${count} ${plural(count, 'участник', 'участника', 'участников')}`;
}

function subtitle(text: string, tone: SubtitleTone = 'default', typing = false, dots = false): Subtitle {
  return { text, tone, typing, dots };
}

export function chatSubtitle(input: SubtitleInput): Subtitle | null {
  if (input.connection !== 'brand') {
    return subtitle(CONNECTION_TEXT[input.connection], 'default', false, input.connection !== 'ipBanned');
  }
  if (input.service) return null;

  const typists = input.typists.filter((typist) => typist.userId !== input.myId);
  if (typists.length > 0) return subtitle(input.group ? groupTyping(typists) : TYPING, 'accent', true);

  if (input.group) {
    const members = input.members;
    if (!members) return null;
    const online = 1 + members.filter((m) => m.id !== input.myId && input.presence(m.id)?.online === true).length;
    const base = membersText(members.length);
    return subtitle(online > 1 ? `${base}, ${online} в сети` : base);
  }

  const other = input.otherMember;
  if (!other) return null;
  const presence = input.presence(other.id);
  if (presence?.online) return subtitle('в сети', 'online');
  return subtitle(formatLastSeen(presence?.lastSeenAt ?? other.lastSeenAt));
}
