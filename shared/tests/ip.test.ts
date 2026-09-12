import { describe, expect, it } from 'vitest';

import { normalizeIpBanTarget, normalizeIpCidr, parseCidr } from '../src/ip.js';

describe('normalizeIpCidr', () => {
  it('одиночный IPv4 становится /32, подсеть — /24', () => {
    expect(normalizeIpCidr('203.0.113.47', false)).toBe('203.0.113.47/32');
    expect(normalizeIpCidr('203.0.113.47', true)).toBe('203.0.113.0/24');
  });

  it('одиночный IPv6 становится /128, подсеть — /64 с обнулённым хвостом', () => {
    expect(normalizeIpCidr('2001:db8:1:2:3:4:5:6', false)).toBe('2001:db8:1:2:3:4:5:6/128');
    expect(normalizeIpCidr('2001:db8:1:2:3:4:5:6', true)).toBe('2001:db8:1:2::/64');
  });

  it('разные записи одного адреса дают одну строку', () => {
    expect(normalizeIpCidr('2001:0db8:0000:0000:0000:0000:0000:0001', false)).toBe(
      normalizeIpCidr('2001:db8::1', false),
    );
    expect(normalizeIpCidr('0:0:0:0:0:0:0:1', false)).toBe('::1/128');
  });

  it('IPv4-mapped сводится к обычному IPv4', () => {
    expect(normalizeIpCidr('::ffff:192.168.0.1', false)).toBe('192.168.0.1/32');
    expect(normalizeIpCidr('::ffff:192.168.0.1', true)).toBe('192.168.0.0/24');
  });

  it('зона и скобки отбрасываются', () => {
    expect(normalizeIpCidr('[fe80::1]', false)).toBe('fe80::1/128');
    expect(normalizeIpCidr('fe80::1%eth0', false)).toBe('fe80::1/128');
  });

  it('мусор и битые адреса не проходят', () => {
    for (const value of ['', 'hello', '256.1.1.1', '01.2.3.4', '1.2.3', '1::2::3', 'gggg::1']) {
      expect(normalizeIpCidr(value, false)).toBeNull();
    }
  });
});

describe('normalizeIpBanTarget', () => {
  it('принимает и голый адрес, и готовый CIDR', () => {
    expect(normalizeIpBanTarget('203.0.113.47')).toBe('203.0.113.47/32');
    expect(normalizeIpBanTarget('203.0.113.0/24')).toBe('203.0.113.0/24');
    expect(normalizeIpBanTarget('2001:db8::/64')).toBe('2001:db8::/64');
    expect(normalizeIpBanTarget('1.2.3.4/17')).toBeNull();
  });
});

describe('parseCidr', () => {
  it('разбирает адрес, длину префикса и версию', () => {
    expect(parseCidr('203.0.113.0/24')).toEqual({ address: '203.0.113.0', prefix: 24, version: 4 });
    expect(parseCidr('2001:db8::/64')).toEqual({ address: '2001:db8::', prefix: 64, version: 6 });
    expect(parseCidr('203.0.113.0')).toBeNull();
    expect(parseCidr('203.0.113.0/33')).toBeNull();
  });
});
