import { describe, expect, it } from 'vitest';
import {
  isValidIpOrCidr,
  normalizeIpInput,
  parseCidr,
  parseIpToBigInt,
} from './ipCidrValidation';

describe('ipCidrValidation', () => {
  describe('精确 IP', () => {
    it('接受合法的 IPv4', () => {
      expect(isValidIpOrCidr('203.0.113.7')).toBe(true);
      expect(isValidIpOrCidr('0.0.0.0')).toBe(true);
      expect(isValidIpOrCidr('255.255.255.255')).toBe(true);
    });

    it('拒绝非法 IPv4', () => {
      expect(isValidIpOrCidr('256.1.1.1')).toBe(false);
      expect(isValidIpOrCidr('1.2.3')).toBe(false);
      expect(isValidIpOrCidr('1.2.3.4.5')).toBe(false);
      expect(isValidIpOrCidr('a.b.c.d')).toBe(false);
      expect(isValidIpOrCidr('1.2.3.4 ')).toBe(false);
      expect(isValidIpOrCidr('01.2.3.4')).toBe(false);
      expect(isValidIpOrCidr('')).toBe(false);
    });

    it('接受合法的 IPv6（含缩写）', () => {
      expect(isValidIpOrCidr('2001:db8::1')).toBe(true);
      expect(isValidIpOrCidr('::1')).toBe(true);
      expect(isValidIpOrCidr('::')).toBe(true);
      expect(isValidIpOrCidr('2001:db8:0:0:0:0:2:1')).toBe(true);
      expect(isValidIpOrCidr('::ffff:192.0.2.128')).toBe(true);
    });

    it('拒绝非法 IPv6', () => {
      expect(isValidIpOrCidr('2001:db8::1::2')).toBe(false);
      expect(isValidIpOrCidr('gggg::1')).toBe(false);
      expect(isValidIpOrCidr('2001:db8:1:2:3:4:5:6:7')).toBe(false);
      expect(isValidIpOrCidr(':')).toBe(false);
      expect(isValidIpOrCidr('1.2.3.4:')).toBe(false);
    });
  });

  describe('CIDR', () => {
    it('接受合法的 IPv4 CIDR', () => {
      expect(isValidIpOrCidr('203.0.113.0/24')).toBe(true);
      expect(isValidIpOrCidr('0.0.0.0/0')).toBe(true);
      expect(isValidIpOrCidr('192.168.1.1/32')).toBe(true);
    });

    it('拒绝网络位不对齐的 IPv4 CIDR', () => {
      expect(isValidIpOrCidr('203.0.113.7/24')).toBe(false);
      expect(isValidIpOrCidr('192.168.1.1/16')).toBe(false);
    });

    it('接受合法的 IPv6 CIDR', () => {
      expect(isValidIpOrCidr('2001:db8::/32')).toBe(true);
      expect(isValidIpOrCidr('::/0')).toBe(true);
    });

    it('拒绝非法的 CIDR', () => {
      expect(isValidIpOrCidr('203.0.113.0/33')).toBe(false);
      expect(isValidIpOrCidr('203.0.113.0/')).toBe(false);
      expect(isValidIpOrCidr('/24')).toBe(false);
      expect(isValidIpOrCidr('203.0.113.0/24x')).toBe(false);
      expect(isValidIpOrCidr('2001:db8::/129')).toBe(false);
      expect(isValidIpOrCidr('abc/24')).toBe(false);
    });
  });

  describe('parseIpToBigInt', () => {
    it('解析 IPv4 为 32bit 整数', () => {
      expect(parseIpToBigInt('203.0.113.7')).toEqual({
        value: 3405803783n,
        version: 4,
      });
    });

    it('解析失败返回 null', () => {
      expect(parseIpToBigInt('not-an-ip')).toBeNull();
    });
  });

  describe('parseCidr', () => {
    it('解析 IPv4 CIDR 返回 base/bits/version', () => {
      expect(parseCidr('203.0.113.0/24')).toEqual({
        base: 3405803776n,
        bits: 24,
        version: 4,
      });
    });

    it('网络位不对齐返回 null', () => {
      expect(parseCidr('203.0.113.7/24')).toBeNull();
    });
  });

  describe('normalizeIpInput', () => {
    it('IPv6 小写化', () => {
      expect(normalizeIpInput('2001:DB8::1')).toBe('2001:db8::1');
    });

    it('IPv4-mapped IPv6 归一为 IPv4', () => {
      expect(normalizeIpInput('::ffff:192.0.2.128')).toBe('192.0.2.128');
    });

    it('CIDR 原样返回', () => {
      expect(normalizeIpInput('203.0.113.0/24')).toBe('203.0.113.0/24');
    });
  });
});
