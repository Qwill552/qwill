import { API_URL } from '../../api/client';

function publicOrigin(): string {
  const origin = window.location.origin;
  if (origin.startsWith('https://') || origin.startsWith('http://')) return origin;
  return new URL(API_URL).origin;
}

export function inviteLinkFor(username: string): string {
  return `${publicOrigin()}/u/${username}`;
}
