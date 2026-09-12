const IPV4_OCTET = /^\d{1,3}$/;
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/;

const IPV4_SUBNET_PREFIX = 24;
const IPV4_HOST_PREFIX = 32;
const IPV6_SUBNET_PREFIX = 64;
const IPV6_HOST_PREFIX = 128;

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!IPV4_OCTET.test(part)) return null;
    const octet = Number(part);
    if (octet > 255 || String(octet) !== part) return null;
    octets.push(octet);
  }
  return octets;
}

function parseIpv6(value: string): number[] | null {
  let text = value;

  const lastColon = text.lastIndexOf(':');
  if (lastColon >= 0 && text.slice(lastColon + 1).includes('.')) {
    const embedded = parseIpv4(text.slice(lastColon + 1));
    if (!embedded) return null;
    const high = ((embedded[0]! << 8) | embedded[1]!).toString(16);
    const low = ((embedded[2]! << 8) | embedded[3]!).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null;
  if (tail === null ? head.length !== 8 : head.length + tail.length > 7) return null;

  const groups: number[] = [];
  for (const group of head) {
    if (!IPV6_GROUP.test(group)) return null;
    groups.push(parseInt(group, 16));
  }
  if (tail !== null) {
    for (let i = head.length + tail.length; i < 8; i += 1) groups.push(0);
    for (const group of tail) {
      if (!IPV6_GROUP.test(group)) return null;
      groups.push(parseInt(group, 16));
    }
  }
  return groups.length === 8 ? groups : null;
}

function formatIpv6(groups: number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  let runLength = 0;

  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index] !== 0) {
      runStart = -1;
      runLength = 0;
      continue;
    }
    if (runStart < 0) {
      runStart = index;
      runLength = 0;
    }
    runLength += 1;
    if (runLength > bestLength) {
      bestStart = runStart;
      bestLength = runLength;
    }
  }

  const hex = groups.map((group) => group.toString(16));
  if (bestLength < 2) return hex.join(':');
  return `${hex.slice(0, bestStart).join(':')}::${hex.slice(bestStart + bestLength).join(':')}`;
}

function mappedIpv4(groups: number[]): number[] | null {
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (!mapped) return null;
  const high = groups[6]!;
  const low = groups[7]!;
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function ipv4Cidr(octets: number[], subnet: boolean): string {
  return subnet
    ? `${octets[0]}.${octets[1]}.${octets[2]}.0/${IPV4_SUBNET_PREFIX}`
    : `${octets.join('.')}/${IPV4_HOST_PREFIX}`;
}

export function normalizeIpCidr(input: string, subnet: boolean): string | null {
  const bare = input.trim().replace(/^\[/, '').replace(/\]$/, '');
  const address = bare.split('%')[0] ?? '';
  if (!address) return null;

  const ipv4 = parseIpv4(address);
  if (ipv4) return ipv4Cidr(ipv4, subnet);

  const groups = parseIpv6(address);
  if (!groups) return null;

  const mapped = mappedIpv4(groups);
  if (mapped) return ipv4Cidr(mapped, subnet);

  if (!subnet) return `${formatIpv6(groups)}/${IPV6_HOST_PREFIX}`;
  return `${formatIpv6([...groups.slice(0, 4), 0, 0, 0, 0])}/${IPV6_SUBNET_PREFIX}`;
}

export function normalizeIpBanTarget(input: string): string | null {
  const value = input.trim();
  const slash = value.indexOf('/');
  if (slash < 0) return normalizeIpCidr(value, false);

  const address = value.slice(0, slash);
  const prefix = Number(value.slice(slash + 1));
  if (prefix === IPV4_SUBNET_PREFIX || prefix === IPV6_SUBNET_PREFIX) return normalizeIpCidr(address, true);
  if (prefix === IPV4_HOST_PREFIX || prefix === IPV6_HOST_PREFIX) return normalizeIpCidr(address, false);
  return null;
}

export interface ParsedCidr {
  address: string;
  prefix: number;
  version: 4 | 6;
}

export function parseCidr(cidr: string): ParsedCidr | null {
  const slash = cidr.indexOf('/');
  if (slash < 0) return null;

  const address = cidr.slice(0, slash);
  const prefix = Number(cidr.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0) return null;

  if (parseIpv4(address)) return prefix <= IPV4_HOST_PREFIX ? { address, prefix, version: 4 } : null;
  if (parseIpv6(address)) return prefix <= IPV6_HOST_PREFIX ? { address, prefix, version: 6 } : null;
  return null;
}
