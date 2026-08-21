///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  cidrContains,
  isValidIpOrCidr,
  normalizeIp,
  normalizeStoredIp,
  parseIpv4ToBigInt,
  parseIpv6ToBigInt,
} from './ip-blacklist.utils';

describe('ip-blacklist.utils', () => {
  describe('parseIpv4ToBigInt', () => {
    it('parses valid IPv4', () => {
      expect(parseIpv4ToBigInt('192.168.0.1')).toBe(0xc0a80001n);
      expect(parseIpv4ToBigInt('0.0.0.0')).toBe(0n);
      expect(parseIpv4ToBigInt('255.255.255.255')).toBe(0xffffffffn);
    });

    it('rejects invalid IPv4', () => {
      expect(parseIpv4ToBigInt('256.1.1.1')).toBeNull();
      expect(parseIpv4ToBigInt('1.2.3')).toBeNull();
      expect(parseIpv4ToBigInt('1.2.3.4.5')).toBeNull();
      expect(parseIpv4ToBigInt('a.b.c.d')).toBeNull();
      expect(parseIpv4ToBigInt('')).toBeNull();
    });
  });

  describe('parseIpv6ToBigInt', () => {
    it('parses valid IPv6', () => {
      expect(parseIpv6ToBigInt('::1')).toBe(1n);
      expect(parseIpv6ToBigInt('2001:db8::1')).toBe(
        0x20010db8000000000000000000000001n
      );
      expect(parseIpv6ToBigInt('::ffff:192.168.0.1')).toBe(
        parseIpv4ToBigInt('192.168.0.1')! + 0xffff00000000n
      );
      expect(parseIpv6ToBigInt('::1.2.3.4')).toBe(
        0x00000000000000000000000001020304n
      );
    });

    it('is case-insensitive', () => {
      expect(parseIpv6ToBigInt('2001:DB8::1')).toBe(
        parseIpv6ToBigInt('2001:db8::1')
      );
    });

    it('rejects invalid IPv6', () => {
      expect(parseIpv6ToBigInt('2001:db8:::1')).toBeNull();
      expect(parseIpv6ToBigInt('1:2:3:4:5:6:7:8:9')).toBeNull();
      expect(parseIpv6ToBigInt('gggg::1')).toBeNull();
      expect(parseIpv6ToBigInt('::')).not.toBeNull();
      expect(parseIpv6ToBigInt('1:2:3:4:5:6:7:8')).not.toBeNull();
    });
  });

  describe('normalizeIp', () => {
    it('converts IPv4-mapped IPv6 to IPv4', () => {
      expect(normalizeIp('::ffff:192.168.0.1')).toBe('192.168.0.1');
      expect(normalizeIp('::FFFF:10.0.0.1')).toBe('10.0.0.1');
    });

    it('lowercases IPv6 for case-insensitive matching', () => {
      expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
    });

    it('keeps IPv4 unchanged', () => {
      expect(normalizeIp('192.168.0.1')).toBe('192.168.0.1');
    });
  });

  describe('isValidIpOrCidr', () => {
    it('accepts valid IPs and CIDRs', () => {
      expect(isValidIpOrCidr('203.0.113.7')).toBe(true);
      expect(isValidIpOrCidr('203.0.113.0/24')).toBe(true);
      expect(isValidIpOrCidr('10.0.0.0/8')).toBe(true);
      expect(isValidIpOrCidr('0.0.0.0/0')).toBe(true);
      expect(isValidIpOrCidr('2001:db8::/32')).toBe(true);
      expect(isValidIpOrCidr('::1')).toBe(true);
      expect(isValidIpOrCidr('::ffff:192.168.0.1')).toBe(true);
    });

    it('rejects non-aligned CIDR (network bits set)', () => {
      expect(isValidIpOrCidr('203.0.113.1/24')).toBe(false);
      expect(isValidIpOrCidr('10.1.0.0/8')).toBe(false);
    });

    it('rejects invalid inputs', () => {
      expect(isValidIpOrCidr('999.1.1.1')).toBe(false);
      expect(isValidIpOrCidr('203.0.113.0/33')).toBe(false);
      expect(isValidIpOrCidr('203.0.113.0/')).toBe(false);
      expect(isValidIpOrCidr('/24')).toBe(false);
      expect(isValidIpOrCidr('not-an-ip')).toBe(false);
      expect(isValidIpOrCidr('')).toBe(false);
      expect(isValidIpOrCidr('2001:db8::/129')).toBe(false);
    });
  });

  describe('cidrContains', () => {
    it('matches IPv4 CIDR', () => {
      expect(cidrContains('203.0.113.0/24', '203.0.113.7')).toBe(true);
      expect(cidrContains('203.0.113.0/24', '203.0.114.7')).toBe(false);
      expect(cidrContains('0.0.0.0/0', '8.8.8.8')).toBe(true);
    });

    it('matches IPv6 CIDR', () => {
      expect(cidrContains('2001:db8::/32', '2001:db8:1::1')).toBe(true);
      expect(cidrContains('2001:db8::/32', '2001:db9::1')).toBe(false);
      expect(cidrContains('::/0', '2001:db8::1')).toBe(true);
    });

    it('rejects version mismatch', () => {
      expect(cidrContains('203.0.113.0/24', '2001:db8::1')).toBe(false);
      expect(cidrContains('2001:db8::/32', '203.0.113.7')).toBe(false);
    });

    it('handles IPv4-mapped client IP against IPv4 CIDR', () => {
      expect(cidrContains('203.0.113.0/24', '::ffff:203.0.113.9')).toBe(true);
    });

    it('rejects invalid args', () => {
      expect(cidrContains('bad/24', '1.2.3.4')).toBe(false);
      expect(cidrContains('1.2.3.0/24', 'bad')).toBe(false);
    });
  });

  describe('normalizeStoredIp', () => {
    it('normalizes exact IP, keeps CIDR verbatim', () => {
      expect(normalizeStoredIp('::ffff:192.168.0.1')).toBe('192.168.0.1');
      expect(normalizeStoredIp('203.0.113.0/24')).toBe('203.0.113.0/24');
    });
  });
});
