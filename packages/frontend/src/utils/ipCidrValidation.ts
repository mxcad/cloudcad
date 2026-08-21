///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// This file is part of the CloudCAD frontend.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * IP / CIDR 校验工具（纯函数，浏览器环境，无 node:net 依赖）
 *
 * 与后端 packages/backend/src/ip-blacklist/ip-blacklist.utils.ts 行为对齐：
 * - 精确 IPv4 / IPv6（含 ::ffff:a.b.c.d 形式，归一为 IPv4）
 * - CIDR（IPv4 /0-/32、IPv6 /0-/128，要求网络位对齐）
 */

const IPV4_STRICT =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/**
 * IPv4 点分十进制 → 32bit bigint；非法返回 null
 */
export function parseIpv4ToBigInt(ip: string): bigint | null {
  if (!IPV4_STRICT.test(ip)) return null;
  const parts = ip.split('.');
  let value = 0n;
  for (const part of parts) {
    value = (value << 8n) | BigInt(Number(part));
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
    head = ipv4Embedded[1]!;
    v4Value = parseIpv4ToBigInt(ipv4Embedded[2]!);
    if (v4Value === null) return null;
    if (head === '') return null; // ':1.2.3.4' 非法
    if (head === ':') head = ''; // '::1.2.3.4' → 左侧为空
  }

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
 * 将 IPv4-mapped IPv6（::ffff:a.b.c.d）归一为 IPv4，其余小写化后返回
 */
export function normalizeIpInput(ip: string): string {
  const lower = ip.toLowerCase();
  if (lower.startsWith('::ffff:') && lower.slice(7).split('.').length === 4) {
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
  const normalized = normalizeIpInput(ip);
  const v4 = parseIpv4ToBigInt(normalized);
  if (v4 !== null) return { value: v4, version: 4 };
  const v6 = parseIpv6ToBigInt(normalized);
  if (v6 !== null) return { value: v6, version: 6 };
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
 * 是否为合法的 IP 或 CIDR
 */
export function isValidIpOrCidr(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed !== value) return false;
  if (isCidr(value)) {
    return parseCidr(value) !== null;
  }
  return parseIpToBigInt(value) !== null;
}
