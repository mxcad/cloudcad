///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { isIP } from 'node:net';

/**
 * IP / CIDR 校验与匹配工具（纯函数，无外部依赖）
 *
 * 支持：
 * - 精确 IPv4 / IPv6（含 ::ffff:a.b.c.d 形式，统一归一为 IPv4）
 * - CIDR（IPv4 /0-/32、IPv6 /0-/128，要求网络位对齐，防止手滑封错段）
 */

/**
 * IPv4 点分十进制 → 32bit bigint；非法返回 null
 */
export function parseIpv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

/**
 * IPv6 文本 → 128bit bigint（支持 :: 缩写与尾部嵌入 IPv4）；非法返回 null
 */
export function parseIpv6ToBigInt(ip: string): bigint | null {
  const compressed = ip.includes('::');
  const ipv4Embedded = ip.match(/^(.*):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  let head = ip;
  let v4Value: bigint | null = null;
  if (ipv4Embedded) {
    head = ipv4Embedded[1];
    v4Value = parseIpv4ToBigInt(ipv4Embedded[2]);
    if (v4Value === null) return null;
    if (head === '') return null; // ':1.2.3.4' 非法（压缩至少一对冒号）
    if (head === ':') head = ''; // '::1.2.3.4' → 左侧为空
  }

  // 允许空 head（::1.2.3.4）与单冒号 head（embedded 匹配后为 ':'），其余不得以单冒号开头/结尾
  if (head.startsWith(':') && head !== ':' && !head.startsWith('::'))
    return null;
  if (head.endsWith(':') && head !== ':' && !head.endsWith('::')) return null;

  const segments = head.split('::');
  if (segments.length > 2) return null;
  const [left = '', right = ''] = segments;
  const leftGroups = left === '' ? [] : left.split(':');
  const rightGroups = right === '' ? [] : right.split(':');
  const v4GroupCount = v4Value === null ? 0 : 2;

  for (const g of [...leftGroups, ...rightGroups]) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
  }

  const total = leftGroups.length + rightGroups.length + v4GroupCount;
  if (total > 8) return null;
  if (!compressed && total !== 8) return null;
  if (compressed && total === 8) return null; // '::' 必须展开至少一组

  const groups: bigint[] = [];
  for (const g of leftGroups) groups.push(BigInt(`0x${g}`));
  for (let i = 0; i < 8 - total; i++) groups.push(0n);
  for (const g of rightGroups) groups.push(BigInt(`0x${g}`));
  if (v4Value !== null) {
    groups.push((v4Value >> 16n) & 0xffffn);
    groups.push(v4Value & 0xffffn);
  }
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const g of groups) value = (value << 16n) | g;
  return value;
}

/**
 * 将 IPv4-mapped IPv6（::ffff:a.b.c.d）归一为 IPv4，其余小写化后返回。
 * 小写化保证 IPv6 精确匹配/CIDR 匹配对大小写不敏感（RFC 5952 允许任意大小写）。
 */
export function normalizeIp(ip: string): string {
  const lower = ip.toLowerCase();
  if (isIP(lower) === 6 && lower.startsWith('::ffff:')) {
    return lower.slice(7);
  }
  return lower;
}

/**
 * IP 文本 → bigint + 版本；非法返回 null
 */
export function parseIpToBigInt(
  ip: string
): { value: bigint; version: 4 | 6 } | null {
  const normalized = normalizeIp(ip);
  const version = isIP(normalized);
  if (version === 4) {
    const value = parseIpv4ToBigInt(normalized);
    return value === null ? null : { value, version: 4 };
  }
  if (version === 6) {
    const value = parseIpv6ToBigInt(normalized);
    return value === null ? null : { value, version: 6 };
  }
  return null;
}

export interface CidrInfo {
  base: bigint;
  bits: number;
  version: 4 | 6;
}

/**
 * 是否为 CIDR（含 '/' 前缀形式）
 */
export function isCidr(value: string): boolean {
  return value.includes('/');
}

/**
 * 按版本与前缀长度计算掩码（主机位全 0 的掩码）
 */
function prefixMask(bits: number, version: 4 | 6): bigint {
  const maxBits = version === 4 ? 32 : 128;
  const hostBits = maxBits - bits;
  return hostBits === 0 ? ~0n : ~((1n << BigInt(hostBits)) - 1n);
}

/**
 * 校验并解析 CIDR（要求网络位对齐）；非法返回 null
 */
export function parseCidr(cidr: string): CidrInfo | null {
  const slash = cidr.lastIndexOf('/');
  if (slash <= 0 || slash === cidr.length - 1) return null;
  const ipPart = cidr.slice(0, slash);
  const bitsStr = cidr.slice(slash + 1);
  if (!/^\d{1,3}$/.test(bitsStr)) return null;

  const parsed = parseIpToBigInt(ipPart);
  if (!parsed) return null;

  const maxBits = parsed.version === 4 ? 32 : 128;
  const bits = Number(bitsStr);
  if (bits < 0 || bits > maxBits) return null;

  const hostBits = maxBits - bits;
  const mask = hostBits === 0 ? 0n : (1n << BigInt(hostBits)) - 1n;
  if ((parsed.value & mask) !== 0n) return null;

  return { base: parsed.value, bits, version: parsed.version };
}

/**
 * 判断 ip 是否命中 cidr（版本必须一致）
 */
export function cidrContains(cidr: string, ip: string): boolean {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  const ipParsed = parseIpToBigInt(ip);
  if (!ipParsed || ipParsed.version !== parsed.version) return false;

  return (
    (ipParsed.value & prefixMask(parsed.bits, parsed.version)) === parsed.base
  );
}

/**
 * 是否为合法的 IP 或 CIDR
 */
export function isValidIpOrCidr(value: string): boolean {
  if (isCidr(value)) {
    return parseCidr(value) !== null;
  }
  return parseIpToBigInt(value) !== null;
}

/**
 * 存储归一化：CIDR 原样（已校验）；精确 IP 归一化（处理 ::ffff: 形式与大小写）
 */
export function normalizeStoredIp(value: string): string {
  return isCidr(value) ? value : normalizeIp(value);
}
